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
}

// CommandRunner runs a short command and returns its combined output and exit code. err is set
// only when the command could not be run at all.
type CommandRunner func(ctx context.Context, name string, args ...string) (out string, code int, err error)

// ExecRunner runs a CLI the way a run would find and start it: from the agent PATH, with the
// agent environment (AgentEnv). It runs the runtime artifact rather than the PATH entry: the
// executable a launch resolves, with the artifact's own environment. Codex installed through npm is
// a Node wrapper on the PATH; a launch skips the wrapper and runs the platform binary, so a probe
// through the wrapper could fail for want of `node` on a daemon's minimal PATH (launchd, systemd)
// while every launch would have worked, or the other way round.
//
// A probe passes the artifact it already identified (withProbeArtifact), and the probe's commands
// run that artifact: never a second resolution,
// which could find a different binary after an upgrade, rehash it inside the command's deadline, or
// fall back to a launcher the resolver refused. Without one, it runs the PATH entry, as before.
//
// What runs is the file at the artifact's path when the command starts. If an upgrade replaces it
// between the hash and the start, the status keeps the digest that was hashed; a launch checks the
// digest again before it runs and refuses a mismatch (artifact.go), so a replaced binary never runs
// as work on the strength of this probe.
func ExecRunner(ctx context.Context, name string, args ...string) (string, int, error) {
	// The same PATH and allowlisted environment as a launch, so a login the run could not see (an
	// API key in the daemon's environment) never makes a runtime look ready.
	env := AgentEnv(os.Environ())
	var path string
	if art, ok := ctx.Value(probeArtifactKey{}).(RuntimeArtifact); ok {
		if art.Path == "" {
			return "", -1, fmt.Errorf("%s: the probed artifact has no path", name)
		}
		path = art.Path
		env = append(env, art.Env...)
	} else {
		p, err := LookPathAgent(name)
		if err != nil {
			return "", -1, err
		}
		path = p
	}
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = env
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
func probeInstalled(ctx context.Context, id, binary string, run CommandRunner, login func(call func(args ...string) (string, int, error), st *RuntimeStatus) bool) RuntimeStatus {
	st := RuntimeStatus{Runtime: id}
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
	probed := withProbeArtifact(ctx, *st.Artifact)
	call := func(args ...string) (string, int, error) {
		c, cancel := context.WithTimeout(probed, probeTimeout)
		defer cancel()
		return run(c, binary, args...)
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
	if login != nil && login(call, &st) {
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

// probeArtifactKey carries the artifact a probe identified to the CommandRunner, so the probe's
// commands run that artifact and the digest on the status is the one that answered.
type probeArtifactKey struct{}

func withProbeArtifact(ctx context.Context, art RuntimeArtifact) context.Context {
	return context.WithValue(ctx, probeArtifactKey{}, art)
}

// preflightArtifactKey carries a probed status's artifact into its preflight as a reference only:
// the preflight's commands do not run it (ExecRunner ignores this key and runs the PATH entry, as on
// main), and the Codex feature check, which resolves again, refuses to run unless what it resolved
// is that same file and digest.
type preflightArtifactKey struct{}

// preflightContext carries a probed status's artifact into its preflight (preflightArtifactKey).
func preflightContext(ctx context.Context, st RuntimeStatus) context.Context {
	if st.Artifact == nil {
		return ctx
	}
	return context.WithValue(ctx, preflightArtifactKey{}, *st.Artifact)
}
