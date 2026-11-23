package runner

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// RuntimeStatus says whether an installed runtime is ready to be offered for work, and why not.
type RuntimeStatus struct {
	Runtime string `json:"runtime"`
	Ready   bool   `json:"ready"`
	Version string `json:"version,omitempty"`
	Reason  string `json:"reason,omitempty"`
	// LoginChecked is true when the CLI could say whether a login is present.
	LoginChecked bool `json:"login_checked"`
	// Artifact is the executable the probe checked: runs launch exactly this file.
	Artifact *RuntimeArtifact `json:"artifact,omitempty"`
	// Models are the model names or aliases discovered for this CLI on this host.
	Models []string `json:"models,omitempty"`
	// timedOut is set when the probe stopped because one of its commands ran past probeTimeout, not
	// because the CLI answered. It is never reported: it only lets the daemon tell a slow host from
	// a runtime that is gone (see Daemon.probe).
	timedOut bool
}

// CommandRunner runs a short command and returns its combined output and exit code. err is set
// only when the command could not be run at all.
type CommandRunner func(ctx context.Context, name string, args ...string) (out string, code int, err error)

// ExecRunner runs a CLI the way a run would find and start it: from the agent PATH, with the
// agent environment (AgentEnv).
func ExecRunner(ctx context.Context, name string, args ...string) (string, int, error) {
	// The same PATH and allowlisted environment as a launch, so a login the run could not see (an
	// API key in the daemon's environment) never makes a runtime look ready.
	path, err := LookPathAgent(name)
	if err != nil {
		return "", -1, err
	}
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = AgentEnv(os.Environ())
	// A helper the CLI started can keep its output pipe open after the CLI is killed; stop waiting
	// for it shortly after the deadline, so a probe never hangs past its timeout.
	cmd.WaitDelay = probeWaitDelay
	out, err := cmd.CombinedOutput()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return string(out), exit.ExitCode(), nil
	}
	if err != nil {
		return string(out), -1, err
	}
	return string(out), 0, nil
}

// probeTimeout bounds each probe command. A var so tests can shorten it.
var probeTimeout = 10 * time.Second

// probeWaitDelay is how long a killed probe command's output pipes may stay open before they are
// closed and the command returns (exec.Cmd.WaitDelay).
var probeWaitDelay = 2 * time.Second

func firstLine(s string) string {
	line, _, _ := strings.Cut(strings.TrimSpace(s), "\n")
	line = strings.TrimSpace(line)
	if len(line) > 200 {
		line = line[:200]
	}
	return line
}

// hasSubcommand reports whether a CLI help text lists `name` as a subcommand: a line whose first
// word is exactly that name.
func hasSubcommand(help, name string) bool {
	sc := bufio.NewScanner(strings.NewReader(help))
	for sc.Scan() {
		f := strings.Fields(sc.Text())
		if len(f) > 0 && f[0] == name {
			return true
		}
	}
	return false
}

// Probe checks one runtime without signing in or using any credential: its version command must
// answer, and for Codex, when `codex login --help` lists a `status` subcommand, `codex login
// status` must say a login is present. The fake runtime is always ready.
func Probe(ctx context.Context, runtime, fakeVersion string, run CommandRunner) RuntimeStatus {
	if a, ok := AdapterFor(runtime); ok {
		return a.Probe(ctx, fakeVersion, run)
	}
	// An unregistered name is probed as a CLI whose id and PATH name are the same string.
	return probeInstalled(ctx, runtime, runtime, run, nil)
}

// probeInstalled checks a CLI runtime's artifact and version. id is the registry id recorded on
// the status. binary is the PATH name passed to resolveArtifact and to the version command. For
// Claude and Codex they are the same string, so the sentences stay the ones the probes used
// before the registry. login, when set, runs after a version answer and reports whether the probe
// should stop before the runtime is marked ready.
func probeInstalled(ctx context.Context, id, binary string, run CommandRunner, login func(call func(args ...string) (string, int, error), st *RuntimeStatus) bool) (st RuntimeStatus) {
	st = RuntimeStatus{Runtime: id}
	timedOut := false
	defer func() {
		if !st.Ready && timedOut {
			st.timedOut = true
		}
	}()
	// Identify the executable before running anything: a launcher Control Rod cannot pin is never
	// executed, not even for its version.
	if art, aerr := resolveArtifact(binary); aerr == nil {
		st.Artifact = &art
	} else if errors.Is(aerr, ErrUnsupportedLauncher) {
		st.Reason = fmt.Sprintf("%s is installed, but Control Rod can only run a runtime it can identify by digest: %v", binary, aerr)
		return st
	} else {
		st.Reason = fmt.Sprintf("%s cannot be found or its executable read to record which version it is: %v", binary, aerr)
		return st
	}
	call := func(args ...string) (string, int, error) {
		c, cancel := context.WithTimeout(ctx, probeTimeout)
		defer cancel()
		out, code, err := run(c, binary, args...)
		// Only this command's own deadline counts: a daemon shutting down cancels ctx, which is not
		// a slow host.
		// A command that exited on its own (a code of 0 or more) answered, even if the deadline passed
		// at the same moment: a sign-out at the deadline is a sign-out, not a slow host.
		if errors.Is(c.Err(), context.DeadlineExceeded) && ctx.Err() == nil && (err != nil || code < 0) {
			timedOut = true
		}
		return out, code, err
	}
	out, code, err := call("--version")
	if err != nil || code != 0 || firstLine(out) == "" {
		detail := firstLine(out)
		if err != nil {
			detail = err.Error()
		}
		st.Reason = fmt.Sprintf("%s is installed but `%s --version` did not answer (exit %d): %s", binary, binary, code, detail)
		return st
	}
	st.Version = firstLine(out)
	stop := login != nil && login(call, &st)
	// A login check that ran out of time (its help or its status command) said nothing about the
	// login: never ready on it, and never reported as signed out either.
	if timedOut {
		st.LoginChecked = false
		st.Reason = fmt.Sprintf("%s is installed but its login check did not answer in time", binary)
		return st
	}
	if stop {
		return st
	}
	st.Ready = true
	return st
}

// ReadyRuntimes returns the names of the ready runtimes, in order.
func ReadyRuntimes(sts []RuntimeStatus) []string {
	out := []string{}
	for _, s := range sts {
		if s.Ready {
			out = append(out, s.Runtime)
		}
	}
	return out
}

func isSafeModelName(s string) bool {
	if len(s) == 0 || len(s) > 100 {
		return false
	}
	for _, r := range s {
		ok := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '.' || r == '_' || r == '-' || r == ':' || r == '/' || r == '@'
		if !ok {
			return false
		}
	}
	return publicText(s) != ""
}

func sanitizeModelList(models []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(models))
	for _, m := range models {
		m = strings.TrimSpace(m)
		if !isSafeModelName(m) || seen[m] {
			continue
		}
		seen[m] = true
		out = append(out, m)
		if len(out) >= 32 {
			break
		}
	}
	return out
}

// discoverCodexModels reads Codex CLI's non-secret models_cache.json (when present) and
// returns "default" followed by the discovered model slugs.
func discoverCodexModels(home string, getenv func(string) string) []string {
	out := []string{"default"}
	dir := ""
	if getenv != nil {
		dir = getenv("CODEX_HOME")
	}
	if dir == "" && home != "" {
		dir = filepath.Join(home, ".codex")
	}
	if dir == "" {
		return out
	}
	data, err := os.ReadFile(filepath.Join(dir, "models_cache.json"))
	if err != nil {
		return out
	}
	var parsed struct {
		Models []struct {
			Slug string `json:"slug"`
		} `json:"models"`
	}
	if err := json.Unmarshal(data, &parsed); err != nil {
		return out
	}
	for _, m := range parsed.Models {
		if m.Slug != "" {
			out = append(out, m.Slug)
		}
	}
	return sanitizeModelList(out)
}
