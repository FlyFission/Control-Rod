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

	"github.com/flyfission/control-rod/daemon/internal/binaryutil"
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
// agent environment (AgentEnv), plus surgical Node-shebang PATH augmentation when needed.
func ExecRunner(ctx context.Context, name string, args ...string) (string, int, error) {
	// The same PATH and allowlisted environment as a launch, so a login the run could not see (an
	// API key in the daemon's environment) never makes a runtime look ready.
	path, err := LookPathAgent(name)
	if err != nil {
		return "", -1, err
	}
	env := AgentEnv(os.Environ())
	if binaryutil.IsNodeLaunchBinary(path) {
		env = withAugmentedNodePATH(env, path)
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

// withAugmentedNodePATH returns a copy of env with PATH surgically augmented for
// a Node-shebang launcher, without adding any non-PATH environment variables.
func withAugmentedNodePATH(env []string, binaryPath string) []string {
	var currentPATH, home string
	for _, kv := range env {
		if v, ok := strings.CutPrefix(kv, "PATH="); ok {
			currentPATH = v
		} else if v, ok := strings.CutPrefix(kv, "HOME="); ok {
			home = v
		}
	}
	nextPATH := binaryutil.AugmentNodePATH(binaryPath, currentPATH, home)
	if nextPATH == currentPATH {
		return env
	}
	return withEnv(slices.Clone(env), "PATH="+nextPATH)
}

func envSecretValues(environ []string) []string {
	var secrets []string
	for _, kv := range environ {
		k, v, ok := strings.Cut(kv, "=")
		if !ok || v == "" {
			continue
		}
		u := strings.ToUpper(k)
		if strings.HasPrefix(u, "CONTROLROD_") && (strings.Contains(u, "TOKEN") || strings.Contains(u, "SECRET")) ||
			strings.HasSuffix(u, "_TOKEN") || strings.Contains(u, "_TOKEN") ||
			strings.HasSuffix(u, "_API_KEY") || strings.HasSuffix(u, "_SECRET") || strings.HasSuffix(u, "_PASSWORD") {
			secrets = append(secrets, v)
		}
	}
	return secrets
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
	secrets := envSecretValues(os.Environ())
	if art, aerr := resolveArtifact(binary); aerr == nil {
		st.Artifact = &art
	} else if errors.Is(aerr, ErrUnsupportedLauncher) {
		st.Reason = fmt.Sprintf("%s is installed, but Control Rod can only run a runtime it can identify by digest: %v", binary, binaryutil.RedactError(aerr, secrets))
		return st
	} else {
		st.Reason = fmt.Sprintf("%s cannot be found or its executable read to record which version it is: %v", binary, binaryutil.RedactError(aerr, secrets))
		return st
	}
	call := func(args ...string) (string, int, error) {
		c, cancel := context.WithTimeout(ctx, probeTimeout)
		defer cancel()
		return run(c, binary, args...)
	}
	out, code, err := call("--version")
	if err != nil || code != 0 || firstLine(out) == "" {
		detail := firstLine(out)
		if err != nil {
			detail = binaryutil.RedactError(err, secrets).Error()
		} else {
			detail = binaryutil.RedactValues(detail, secrets)
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
