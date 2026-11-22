package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
)

// hostEnv is the real host for an agent update check.
func hostEnv() agentupdate.Env {
	return agentupdate.Env{
		LookPath:     exec.LookPath,
		EvalSymlinks: filepath.EvalSymlinks,
		Version: func(ctx context.Context, path string) (string, error) {
			c, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			out, err := exec.CommandContext(c, path, "--version").Output()
			return string(out), err
		},
		Latest: agentupdate.RegistryLatest(&http.Client{Timeout: 5 * time.Second}, os.Getenv("CONTROLROD_NPM_REGISTRY")),
	}
}

// updateCheckOff reports whether the person turned the startup check off.
func updateCheckOff(getenv func(string) string) bool {
	v := strings.ToLower(strings.TrimSpace(getenv("CONTROLROD_UPDATE_CHECK")))
	return v == "0" || v == "off" || v == "false" || v == "no"
}

// runUpdate runs a package-manager command for the daemon, with no shell, and returns its output.
func runUpdate(ctx context.Context, name string, args []string) (string, error) {
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	return string(out), err
}

// agents runs `controlrod agents [check]` and `controlrod agents update [--all] [--yes] [agent...]`.
func agents(args []string) int {
	if len(args) == 0 || args[0] == "check" {
		ctx, cancel := context.WithTimeout(context.Background(), agentupdate.CheckTimeout)
		defer cancel()
		printStatuses(os.Stdout, agentupdate.Check(ctx, hostEnv(), agentupdate.Catalog))
		return 0
	}
	if args[0] != "update" {
		fmt.Fprintln(os.Stderr, "usage: controlrod agents [check] | controlrod agents update [--all] [--yes] [agent...]")
		return 2
	}
	fs := flag.NewFlagSet("agents update", flag.ContinueOnError)
	all := fs.Bool("all", false, "update every agent with a newer version")
	yes := fs.Bool("yes", false, "run the commands without asking (you have read them)")
	if err := fs.Parse(args[1:]); err != nil {
		return 2
	}
	ctx, cancel := context.WithTimeout(context.Background(), agentupdate.CheckTimeout)
	sts := agentupdate.Check(ctx, hostEnv(), agentupdate.Catalog)
	cancel()
	run := func(name string, argv []string) error {
		cmd := exec.Command(name, argv...)
		cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
		return cmd.Run()
	}
	return update(os.Stdout, os.Stdin, sts, fs.Args(), *all, *yes, isTerminal(os.Stdin), run)
}

// update chooses the agents to update, shows each command, asks, and runs only what was agreed.
func update(w io.Writer, in io.Reader, sts []agentupdate.Status, names []string, all, yes, tty bool, run func(string, []string) error) int {
	outdated := agentupdate.Outdated(sts)
	var chosen []agentupdate.Status
	switch {
	case all && len(names) > 0:
		fmt.Fprintln(w, "Name agents or pass --all, not both.")
		return 2
	case all:
		chosen = outdated
	case len(names) > 0:
		for _, n := range names {
			found := false
			for _, s := range outdated {
				if s.Agent.ID == n || s.Agent.Binary == n {
					chosen, found = append(chosen, s), true
				}
			}
			if !found {
				fmt.Fprintf(w, "%s has no update to install (run `controlrod agents` to see why).\n", n)
				return 1
			}
		}
	default:
		chosen = outdated
	}
	if len(chosen) == 0 {
		fmt.Fprintln(w, "Every agent is up to date.")
		return 0
	}
	if !yes && !tty {
		fmt.Fprintln(w, "Not a terminal: pass --yes to run the commands shown by `controlrod agents`.")
		return 2
	}
	reader := bufio.NewReader(in)
	if all && !yes {
		// Update all: every command is shown first, then one yes covers exactly those.
		for _, s := range chosen {
			if s.Command != nil {
				fmt.Fprintf(w, "  %s: %s\n", s.Agent.Name, strings.Join(s.Command, " "))
			}
		}
		if !confirm(w, reader, "Run these? [y/N] ") {
			fmt.Fprintln(w, "Nothing was run.")
			return 0
		}
		yes = true
	}
	failed := 0
	for _, s := range chosen {
		fmt.Fprintf(w, "%s %s -> %s\n", s.Agent.Name, s.Installed, s.Latest)
		if s.Command == nil {
			fmt.Fprintf(w, "  not updated: %s\n", s.Note)
			continue
		}
		fmt.Fprintf(w, "  will run: %s\n", strings.Join(s.Command, " "))
		if !yes && !confirm(w, reader, "  Run it? [y/N] ") {
			fmt.Fprintln(w, "  skipped")
			continue
		}
		if err := run(s.Command[0], s.Command[1:]); err != nil {
			fmt.Fprintf(w, "  failed: %v\n", err)
			failed++
			continue
		}
		fmt.Fprintln(w, "  done")
		if s.Agent.ID == "claude" || s.Agent.ID == "codex" {
			fmt.Fprintln(w, "  If this runtime is pinned, runs keep refusing the new build until an administrator pins it.")
		}
	}
	if failed > 0 {
		return 1
	}
	return 0
}

func confirm(w io.Writer, r *bufio.Reader, prompt string) bool {
	fmt.Fprint(w, prompt)
	line, _ := r.ReadString('\n')
	a := strings.ToLower(strings.TrimSpace(line))
	return a == "y" || a == "yes"
}

func printStatuses(w io.Writer, sts []agentupdate.Status) {
	if len(sts) == 0 {
		fmt.Fprintln(w, "No built-in agent CLI was found on PATH.")
		return
	}
	n := len(agentupdate.Outdated(sts))
	switch n {
	case 0:
		fmt.Fprintln(w, "Every agent found is up to date.")
	case 1:
		fmt.Fprintln(w, "1 agent update. Newer versions bring bug fixes, new models and features.")
	default:
		fmt.Fprintf(w, "%d agent updates. Newer versions bring bug fixes, new models and features.\n", n)
	}
	for _, s := range sts {
		installed := s.Installed
		if installed == "" {
			installed = "unknown"
		}
		line := fmt.Sprintf("  %-16s %s", s.Agent.Name, installed)
		if s.Outdated() {
			line += " -> " + s.Latest
		} else if s.Latest != "" {
			line += " (latest)"
		}
		fmt.Fprintln(w, line)
		if s.Outdated() && s.Command != nil {
			fmt.Fprintf(w, "  %-16s update runs: %s\n", "", strings.Join(s.Command, " "))
		} else if s.Note != "" && (s.Outdated() || s.Latest == "") {
			fmt.Fprintf(w, "  %-16s %s\n", "", s.Note)
		}
	}
	if n > 0 {
		fmt.Fprintln(w, "Run `controlrod agents update` to review each command, or `controlrod agents update --all`.")
	}
}

func isTerminal(f *os.File) bool {
	fi, err := f.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}
