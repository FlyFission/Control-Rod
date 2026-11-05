// Command controlrod is the Control Rod CLI and run daemon.
//
//	controlrod version
//	controlrod daemon [--parallel N] [--timeout 45m]
//	controlrod sandbox-args --runtime claude|codex --policy FILE --workspace DIR [--home DIR] [--daemon-home DIR]
//
// The daemon claims jobs from the control plane, runs an agent runtime in a per-job workspace
// and reports outputs with an execution trace. It never makes a decision.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/runner"
	"github.com/flyfission/control-rod/daemon/internal/version"
)

const usage = "usage: controlrod version | controlrod daemon [--parallel N] [--timeout 45m] | controlrod sandbox-args --runtime claude|codex --policy FILE --workspace DIR"

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
	switch os.Args[1] {
	case "version":
		fmt.Println(version.Version)
	case "daemon":
		os.Exit(daemon(os.Args[2:]))
	case "sandbox-args":
		os.Exit(sandboxArgs(os.Args[2:]))
	default:
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
}

func daemon(args []string) int {
	fs := flag.NewFlagSet("daemon", flag.ContinueOnError)
	parallel := fs.Int("parallel", 3, "jobs to run at once")
	timeout := fs.Duration("timeout", 45*time.Minute, "longest a single run may take")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, nil))
	home, err := runner.Home(os.Getenv)
	if err != nil {
		logger.Error(err.Error())
		return 1
	}
	token, err := runner.Token(os.Getenv, home)
	if err != nil {
		logger.Error(err.Error())
		return 1
	}
	api := os.Getenv("CONTROLROD_API")
	if api == "" {
		api = "http://localhost:7300"
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	d := runner.New(runner.Config{
		API:      api,
		Token:    token,
		Home:     home,
		Parallel: *parallel,
		Timeout:  *timeout,
		Runtimes: runner.Detect(exec.LookPath, os.Getenv),
		Version:  version.Version,
		Logger:   logger,
	})
	if err := d.Run(ctx); err != nil {
		logger.Error(err.Error())
		return 1
	}
	return 0
}

// sandboxArgs prints, as JSON, exactly how a run would be launched under a sandbox policy: the
// argument list and the environment the agent CLI receives (plan task 6.2). It runs nothing.
func sandboxArgs(args []string) int {
	fs := flag.NewFlagSet("sandbox-args", flag.ContinueOnError)
	rt := fs.String("runtime", "", "claude or codex")
	policyFile := fs.String("policy", "", "the sandbox policy JSON, as the control plane sends it")
	workspace := fs.String("workspace", "", "the run workspace")
	home, _ := os.UserHomeDir()
	homeDir := fs.String("home", home, "the home folder the policy's ~ means")
	daemonHome := fs.String("daemon-home", "", "the daemon's home (default ~/.controlrod)")
	model := fs.String("model", "", "the model the run names, if any")
	if err := fs.Parse(args); err != nil {
		return 2
	}
	raw, err := os.ReadFile(*policyFile)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	var p runner.SandboxPolicy
	if err := json.Unmarshal(raw, &p); err != nil {
		fmt.Fprintln(os.Stderr, "read policy:", err)
		return 1
	}
	if *daemonHome == "" {
		*daemonHome = filepath.Join(*homeDir, ".controlrod")
	}
	ws := &runner.Workspace{Dir: *workspace, Inputs: filepath.Join(*workspace, "inputs"), Out: filepath.Join(*workspace, "out")}
	run := runner.Run{ID: "sandbox-args", Role: "author", Runtime: runner.RuntimeRef{Provider: *rt, Model: *model}}
	at := runner.SandboxPaths{Home: *homeDir, DaemonHome: *daemonHome, Workspace: *workspace, Logins: runner.LoginLocations(os.Getenv, *homeDir)}
	cmd, err := runner.Command(runner.RuntimeFor(*rt), run, ws, &p, at)
	if err != nil || cmd == nil {
		fmt.Fprintln(os.Stderr, "no launch:", err)
		return 1
	}
	if *rt == runner.RuntimeCodex {
		// As the daemon launches it: the verified install, staged outside the home folder.
		a, err := runner.ResolveArtifact("codex")
		if err == nil {
			a, err = runner.StageArtifact(a, runner.StageRoot())
		}
		if err != nil {
			fmt.Fprintln(os.Stderr, "stage codex:", err)
			return 1
		}
		cmd.Args[0] = a.Path
		cmd.Env = append(cmd.Env, a.Env...)
	}
	out, _ := json.MarshalIndent(map[string]any{"argv": cmd.Args, "env": cmd.Env, "dir": cmd.Dir}, "", "  ")
	fmt.Println(string(out))
	return 0
}
