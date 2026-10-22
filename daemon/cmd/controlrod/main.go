// Command controlrod is the Control Rod CLI and run daemon.
//
//	controlrod version
//	controlrod daemon [--parallel N] [--timeout 45m]
//
// The daemon claims jobs from the control plane, runs an agent runtime in a per-job workspace
// and reports outputs with an execution trace. It never makes a decision.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/runner"
	"github.com/flyfission/control-rod/daemon/internal/version"
)

const usage = "usage: controlrod version | controlrod daemon [--parallel N] [--timeout 45m]"

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
