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
	"slices"
	"strings"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
)

// hostEnv is the real host for an agent update check.
func hostEnv() agentupdate.Env {
	return agentupdate.Env{
		LookPath:     exec.LookPath,
		EvalSymlinks: filepath.EvalSymlinks,
		Stat:         os.Stat,
		Version: func(ctx context.Context, path string) (string, error) {
			c, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			out, err := exec.CommandContext(c, path, "--version").Output()
			return string(out), err
		},
		Latest: agentupdate.RegistryLatest(&http.Client{Timeout: 5 * time.Second}, os.Getenv("CONTROLROD_NPM_REGISTRY")),
		NpmRoot: func(ctx context.Context) (string, error) {
			c, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			out, err := exec.CommandContext(c, "npm", "root", "--global").Output()
			return strings.TrimSpace(string(out)), err
		},
	}
}

// updateCheckOff reports whether the person turned the startup check off.
func updateCheckOff(getenv func(string) string) bool {
	v := strings.ToLower(strings.TrimSpace(getenv("CONTROLROD_UPDATE_CHECK")))
	return v == "0" || v == "off" || v == "false" || v == "no"
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
	env := hostEnv()
	recheck := func(s agentupdate.Status) string {
		c, cancel := context.WithTimeout(context.Background(), agentupdate.CheckTimeout)
		defer cancel()
		_, why := agentupdate.Recheck(c, env, s)
		return why
	}
	return update(os.Stdout, os.Stdin, sts, fs.Args(), *all, *yes, isTerminal(os.Stdin), run, recheck)
}

// update chooses the agents to update, shows each command, asks, and runs only what was agreed.
// It is the person's own terminal action, like running the npm command themselves: a run using the
// CLI at that moment keeps whatever npm leaves, so the confirmation says to update between runs.
// Each agent is updated at most once, however often it is named. recheck, when set, looks at the
// agent again right before its install, after the yes (agentupdate.Recheck: the same executable on
// PATH, still npm's global copy, still older than latest) and returns why not to install, or "".
func update(w io.Writer, in io.Reader, sts []agentupdate.Status, names []string, all, yes, tty bool, run func(string, []string) error, recheck func(agentupdate.Status) string) int {
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
					found = true
					if !slices.ContainsFunc(chosen, func(c agentupdate.Status) bool { return c.Agent.ID == s.Agent.ID }) {
						chosen = append(chosen, s)
					}
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
		if !anyCheckable(sts) {
			fmt.Fprintln(w, noneCheckable)
			return 0
		}
		if unknown := incomplete(sts); len(unknown) > 0 {
			fmt.Fprintf(w, "No update found, but %s could not be checked (run `controlrod agents` to see why).\n", strings.Join(unknown, ", "))
			return 1
		}
		if skipped := notChecked(sts); len(skipped) > 0 {
			fmt.Fprintf(w, "Every agent checked is up to date; %s was not checked.\n", strings.Join(skipped, ", "))
			return 0
		}
		fmt.Fprintln(w, "Every agent is up to date.")
		return 0
	}
	if !yes && !tty {
		fmt.Fprintln(w, "Not a terminal: pass --yes to run the commands shown by `controlrod agents`.")
		return 2
	}
	reader := bufio.NewReader(in)
	fmt.Fprintln(w, "Update between runs: a run using one of these CLIs right now may fail.")
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
		if recheck != nil {
			if why := recheck(s); why != "" {
				fmt.Fprintf(w, "  not updated: %s\n", why)
				failed++
				continue
			}
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
	unknown := incomplete(sts)
	switch {
	case !anyCheckable(sts):
		fmt.Fprintln(w, noneCheckable)
	case n == 0 && len(unknown) > 0:
		fmt.Fprintf(w, "No update found, but %s could not be checked.\n", strings.Join(unknown, ", "))
	case n == 0 && len(notChecked(sts)) > 0:
		fmt.Fprintf(w, "Every agent checked is up to date; %s was not checked.\n", strings.Join(notChecked(sts), ", "))
	case n == 0:
		fmt.Fprintln(w, "Every agent found is up to date.")
	case n == 1:
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
		switch {
		case s.Outdated():
			line += " -> " + s.Latest
		case s.Agent.Package == "":
			line += " (not checked)"
		case s.Incomplete():
			line += " (could not check)"
		case s.Latest != "":
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

// noneCheckable is said when no agent found has a package whose latest version can be looked up.
const noneCheckable = "No agent CLI found that Control Rod can check for updates."

func anyCheckable(sts []agentupdate.Status) bool {
	for _, s := range sts {
		if s.Agent.Package != "" {
			return true
		}
	}
	return false
}

// notChecked names the agents found that have no package to look up (Antigravity).
func notChecked(sts []agentupdate.Status) []string {
	var out []string
	for _, s := range sts {
		if s.Agent.Package == "" {
			out = append(out, s.Agent.Name)
		}
	}
	return out
}

// incomplete names the agents whose check could not compare versions.
func incomplete(sts []agentupdate.Status) []string {
	var out []string
	for _, s := range sts {
		if s.Incomplete() && s.Agent.Package != "" {
			out = append(out, s.Agent.Name)
		}
	}
	return out
}

func isTerminal(f *os.File) bool {
	fi, err := f.Stat()
	return err == nil && fi.Mode()&os.ModeCharDevice != 0
}
