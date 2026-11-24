// Command controlrod is the Control Rod CLI and run daemon.
//
//	controlrod version
//	controlrod daemon [--parallel N] [--timeout 45m]
//	controlrod check --author-runtime RT (--diff FILE | --base REF) (--criteria FILE | --criteria-text TEXT)
//	controlrod sandbox-args --runtime claude|codex --policy FILE --workspace DIR [--home DIR] [--daemon-home DIR]
//	controlrod attestation-public
//	controlrod agents [check] | controlrod agents update [--all] [--yes] [agent...]
//	controlrod runtimes
//
// The daemon claims jobs from the control plane, runs an agent runtime in a per-job workspace
// and reports outputs with an execution trace. It never makes a decision.
package main

import (
	"context"
	"crypto/ed25519"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
	"github.com/flyfission/control-rod/daemon/internal/runner"
	"github.com/flyfission/control-rod/daemon/internal/version"
)

const usage = "usage: controlrod version | controlrod daemon [--parallel N] [--timeout 45m] | controlrod check --author-runtime RT (--diff FILE | --base REF) (--criteria FILE | --criteria-text TEXT) | controlrod sandbox-args --runtime claude|codex --policy FILE --workspace DIR | controlrod attestation-public | controlrod agents [check|update] | controlrod runtimes"

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
	case "check":
		os.Exit(runCheckCLI(os.Args[2:], os.Stdin, os.Stdout, os.Stderr))
	case "sandbox-args":
		os.Exit(sandboxArgs(os.Args[2:]))
	case "attestation-public":
		os.Exit(attestationPublic())
	case "agents":
		os.Exit(agents(os.Args[2:]))
	case "runtimes":
		os.Exit(runtimesCheck())
	default:
		fmt.Fprintln(os.Stderr, usage)
		os.Exit(2)
	}
}

func attestationPublic() int {
	priv, err := runner.InitSigningKey()
	if err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		return 1
	}
	pub := priv.Public().(ed25519.PublicKey)
	fmt.Printf("key_id %s\npublic_key %s\n", runner.PublicKeyID(pub), runner.PublicKeyBase64(pub))
	return 0
}

func daemon(args []string) int {
	fs := flag.NewFlagSet("daemon", flag.ContinueOnError)
	parallel := fs.Int("parallel", 3, "jobs to run at once")
	timeout := fs.Duration("timeout", 45*time.Minute, "longest a single run may take")
	noUpdateCheck := fs.Bool("no-update-check", false, "do not check agent CLIs for newer versions at startup (also CONTROLROD_UPDATE_CHECK=0)")
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
	ctx = stopWhenLauncherGone(ctx, os.Getenv("CONTROLROD_LAUNCHER_PID"), os.Getppid)
	cfg := runner.Config{
		API:       api,
		Token:     token,
		TokenFile: runner.TokenFile(os.Getenv, home),
		Home:      home,
		Parallel:  *parallel,
		Timeout:   *timeout,
		Runtimes:  runner.Detect(exec.LookPath, os.Getenv),
		Version:   version.Version,
		Logger:    logger,
	}
	// Once, at startup, never on a timer: the daemon says which agent CLIs have a newer version.
	// It never installs; the person runs `controlrod agents update` or the command the app shows.
	if !*noUpdateCheck && !updateCheckOff(os.Getenv) {
		cfg.UpdateCheck = func(ctx context.Context) []agentupdate.Status {
			return agentupdate.Check(ctx, hostEnv(), agentupdate.Catalog)
		}
		env := hostEnv()
		cfg.UpdateStamp = func(binary string) string { return agentupdate.Stamp(env, binary) }
	} else {
		cfg.UpdateCheckOff = true
	}
	d := runner.New(cfg)
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
	if adapt, ok := runner.AdapterFor(runner.RuntimeFor(*rt)); ok {
		if stager, ok := adapt.(runner.ArtifactStager); ok && stager.StagesArtifact() {
			// As the daemon launches it: the verified install, staged outside the home folder.
			// Binary() is the PATH name, which for this runtime equals its id.
			a, err := runner.ResolveArtifact(adapt.Binary())
			if err == nil {
				a, err = runner.StageArtifact(a, runner.StageRoot())
			}
			if err != nil {
				fmt.Fprintf(os.Stderr, "stage %s: %v\n", adapt.ID(), err)
				return 1
			}
			cmd.Args[0] = a.Path
			cmd.Env = append(cmd.Env, a.Env...)
		}
	}
	out, _ := json.MarshalIndent(map[string]any{"argv": cmd.Args, "env": cmd.Env, "dir": cmd.Dir}, "", "  ")
	fmt.Println(string(out))
	return 0
}

// runCheckCLI runs `controlrod check`: an independent blind check of a diff
// against acceptance criteria, exiting 0 on pass, 1 on fail/inconclusive, and 2
// on invalid configuration or independence/preflight refusal.
func runCheckCLI(args []string, stdin io.Reader, stdout, stderr io.Writer) int {
	return runCheckCLIWith(args, runner.CheckConfig{}, stdin, stdout, stderr)
}

func runCheckCLIWith(args []string, base runner.CheckConfig, stdin io.Reader, stdout, stderr io.Writer) int {
	fs := flag.NewFlagSet("check", flag.ContinueOnError)
	fs.SetOutput(stderr)
	authorRuntime := fs.String("author-runtime", "", "author runtime or vendor whose diff is being checked (e.g. claude, codex)")
	checkerRuntime := fs.String("checker", "", "checker runtime from a different vendor family (auto-selected if omitted)")
	model := fs.String("model", "", "checker model ID (defaults to the runtime's registered deciding model)")
	diffFile := fs.String("diff", "", "path to unified diff/patch file, or - for stdin")
	baseRef := fs.String("base", "", "base git ref when computing a diff with git")
	headRef := fs.String("head", "HEAD", "head git ref when using --base (default HEAD)")
	headSHA := fs.String("head-sha", "", "optional PR head commit SHA for receipt binding when using --diff")
	repoDir := fs.String("repo", ".", "git repository directory when using --base")
	criteriaFile := fs.String("criteria", "", "path to acceptance criteria file")
	criteriaRef := fs.String("criteria-ref", "", "optional git ref to read --criteria from via git show (prevents PR edits to criteria)")
	criteriaText := fs.String("criteria-text", "", "inline acceptance criteria text")
	grade := fs.String("grade", "general-service", "grade: general-service, material, or safety")
	packageID := fs.String("package-id", "standalone", "label for the target in the verdict and receipt")
	revision := fs.Int("revision", 0, "optional package revision number for receipt binding")
	output := fs.String("output", "text", "output format: text, json, or markdown")
	receiptOut := fs.String("receipt-out", "", "optional path to write the Markdown PR receipt")
	verdictOut := fs.String("verdict-out", "", "optional path to write the JSON verdict")
	timeout := fs.Duration("timeout", 15*time.Minute, "longest the check may take")
	if err := fs.Parse(args); err != nil {
		return 2
	}

	switch *output {
	case "text", "json", "markdown":
	default:
		fmt.Fprintf(stderr, "invalid --output %q: must be text, json, or markdown\n", *output)
		return 2
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg := base
	cfg.AuthorRuntime = *authorRuntime
	cfg.CheckerRuntime = *checkerRuntime
	cfg.Model = *model
	cfg.DiffFile = *diffFile
	cfg.BaseRef = *baseRef
	cfg.HeadRef = *headRef
	cfg.HeadSHA = *headSHA
	cfg.RepoDir = *repoDir
	cfg.CriteriaFile = *criteriaFile
	cfg.CriteriaRef = *criteriaRef
	cfg.CriteriaText = *criteriaText
	cfg.Grade = *grade
	cfg.PackageID = *packageID
	cfg.Revision = *revision
	cfg.Timeout = *timeout
	cfg.Stdin = stdin

	res, err := runner.RunCheck(ctx, cfg)
	if err != nil {
		if errors.Is(err, runner.ErrCheckUsage) {
			fmt.Fprintln(stderr, err.Error())
			return 2
		}
		if res.Outcome == "" {
			fmt.Fprintln(stderr, err.Error())
			return 1
		}
	}

	if *verdictOut != "" {
		raw, _ := json.MarshalIndent(res, "", "  ")
		if werr := os.WriteFile(*verdictOut, append(raw, '\n'), 0o600); werr != nil {
			fmt.Fprintf(stderr, "write --verdict-out: %v\n", werr)
			return 1
		}
	}
	if *receiptOut != "" && res.ReceiptMarkdown != "" {
		if werr := os.WriteFile(*receiptOut, []byte(res.ReceiptMarkdown), 0o600); werr != nil {
			fmt.Fprintf(stderr, "write --receipt-out: %v\n", werr)
			return 1
		}
	}

	switch *output {
	case "json":
		raw, _ := json.MarshalIndent(res, "", "  ")
		fmt.Fprintln(stdout, string(raw))
	case "markdown":
		fmt.Fprint(stdout, res.ReceiptMarkdown)
	default:
		fmt.Fprint(stdout, runner.FormatCheckText(res))
	}

	if err != nil || res.Outcome != "pass" {
		return 1
	}
	return 0
}

// stopWhenLauncherGone ends ctx, the same graceful stop as a signal, once the launcher named by
// launcherPID (set by `pnpm cr start`) is no longer this process's parent: a launcher killed outright
// cannot stop its children, so the daemon notices on its own. An empty or invalid value does nothing.
func stopWhenLauncherGone(ctx context.Context, launcherPID string, getppid func() int) context.Context {
	pid, err := strconv.Atoi(launcherPID)
	if err != nil || pid <= 1 {
		return ctx
	}
	ctx, cancel := context.WithCancel(ctx)
	go func() {
		defer cancel()
		t := time.NewTicker(time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if getppid() != pid {
					return
				}
			}
		}
	}()
	return ctx
}
