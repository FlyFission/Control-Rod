package runner

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
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
}

// CommandRunner runs a short command and returns its combined output and exit code. err is set
// only when the command could not be run at all.
type CommandRunner func(ctx context.Context, name string, args ...string) (out string, code int, err error)

// ExecRunner runs commands with the agent environment (no CONTROLROD_ variables).
func ExecRunner(ctx context.Context, name string, args ...string) (string, int, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Env = ChildEnv(os.Environ())
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

const probeTimeout = 10 * time.Second

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
	st := RuntimeStatus{Runtime: runtime}
	if runtime == RuntimeFake {
		st.Ready, st.Version = true, fakeVersion
		return st
	}
	// Identify the executable before running anything: a launcher Control Rod cannot pin is never
	// executed, not even for its version.
	if art, aerr := resolveArtifact(runtime); aerr == nil {
		st.Artifact = &art
	} else if errors.Is(aerr, ErrUnsupportedLauncher) {
		st.Reason = fmt.Sprintf("%s is installed, but Control Rod can only run a runtime it can identify by digest: %v", runtime, aerr)
		return st
	} else {
		st.Reason = fmt.Sprintf("%s cannot be found or its executable read to record which version it is: %v", runtime, aerr)
		return st
	}
	call := func(args ...string) (string, int, error) {
		c, cancel := context.WithTimeout(ctx, probeTimeout)
		defer cancel()
		return run(c, runtime, args...)
	}
	out, code, err := call("--version")
	if err != nil || code != 0 || firstLine(out) == "" {
		detail := firstLine(out)
		if err != nil {
			detail = err.Error()
		}
		st.Reason = fmt.Sprintf("%s is installed but `%s --version` did not answer (exit %d): %s", runtime, runtime, code, detail)
		return st
	}
	st.Version = firstLine(out)
	if runtime == RuntimeCodex {
		help, hcode, herr := call("login", "--help")
		if herr == nil && hcode == 0 && hasSubcommand(help, "status") {
			st.LoginChecked = true
			if _, scode, serr := call("login", "status"); serr != nil || scode != 0 {
				st.Reason = fmt.Sprintf("codex is installed but not signed in (`codex login status` exit %d). Sign in yourself with `codex login`; Control Rod never does.", scode)
				return st
			}
		}
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
