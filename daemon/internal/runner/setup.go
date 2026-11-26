package runner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// SetupDirective is the TOOLS.txt line that turns the checkout setup off for a project. The control
// plane writes it from the project's setting; it is a directive for the daemon, never a tool name.
const SetupDirective = "setup: off"

// SetupTimeout bounds one setup step. A slow registry must not hold the card for long: past it the
// step is stopped, the run log says so, and the agent starts anyway.
const SetupTimeout = 10 * time.Minute

// SetupStep is one dependency install the daemon runs in a checkout before the author agent starts.
// The agent's sandbox has no network, so without it a fresh worktree has no packages and the agent
// cannot run the project's tests (the Conductor and Vibe Kanban "setup script" pattern, with the
// commands read from the lockfile the project already has).
type SetupStep struct {
	// Lockfile names the file that chose this step, for the run log.
	Lockfile string
	// Bin is the tool, found on the daemon's PATH; a missing tool skips the step with a notice.
	Bin  string
	Args []string
	// Done is a path in the checkout whose presence means the step already ran there, so a later
	// round in the same worktree starts at once. "" means the step always runs (download-only steps
	// whose caches make a repeat fast).
	Done string
}

func (s SetupStep) command() string { return s.Bin + " " + strings.Join(s.Args, " ") }

// SetupSteps reads the checkout's top level and returns the installs its lockfiles ask for, at most
// one per ecosystem. Every step installs exactly what the lockfile pins and none runs the project's
// own scripts: the install runs outside the agent's sandbox, with the person's tools and network,
// so code from the checkout (a lifecycle script an earlier round could have written) never runs
// there. Go and Cargo steps only download.
func SetupSteps(dir string) []SetupStep {
	has := func(name string) bool {
		fi, err := os.Lstat(filepath.Join(dir, name))
		return err == nil && fi.Mode().IsRegular()
	}
	var steps []SetupStep
	switch {
	case has("pnpm-lock.yaml"):
		steps = append(steps, SetupStep{Lockfile: "pnpm-lock.yaml", Bin: "pnpm", Args: []string{"install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"}, Done: "node_modules"})
	case has("bun.lock") || has("bun.lockb"):
		lock := "bun.lock"
		if !has(lock) {
			lock = "bun.lockb"
		}
		steps = append(steps, SetupStep{Lockfile: lock, Bin: "bun", Args: []string{"install", "--frozen-lockfile", "--ignore-scripts"}, Done: "node_modules"})
	case has("package-lock.json"):
		steps = append(steps, SetupStep{Lockfile: "package-lock.json", Bin: "npm", Args: []string{"ci", "--prefer-offline", "--ignore-scripts", "--no-audit", "--no-fund"}, Done: "node_modules"})
	}
	if has("uv.lock") {
		steps = append(steps, SetupStep{Lockfile: "uv.lock", Bin: "uv", Args: []string{"sync", "--frozen", "--no-install-project", "--no-build"}, Done: ".venv"})
	}
	if has("go.sum") {
		steps = append(steps, SetupStep{Lockfile: "go.sum", Bin: "go", Args: []string{"mod", "download"}})
	}
	if has("Cargo.lock") {
		steps = append(steps, SetupStep{Lockfile: "Cargo.lock", Bin: "cargo", Args: []string{"fetch", "--locked"}})
	}
	return steps
}

// SetupWanted reports whether the job's TOOLS.txt leaves the checkout setup on (the default).
func SetupWanted(ws *Workspace) bool {
	b, err := os.ReadFile(filepath.Join(ws.Inputs, "TOOLS.txt"))
	if err != nil {
		return true
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.EqualFold(strings.TrimSpace(line), SetupDirective) {
			return false
		}
	}
	return true
}

// SetupRunner runs one step; tests replace it. It returns the step's combined output.
type SetupRunner func(ctx context.Context, dir string, s SetupStep) ([]byte, error)

func runSetupStep(ctx context.Context, dir string, s SetupStep) ([]byte, error) {
	bin, err := exec.LookPath(s.Bin)
	if err != nil {
		return nil, errSetupToolMissing
	}
	cmd := exec.CommandContext(ctx, bin, s.Args...)
	cmd.Dir = dir
	// The daemon's secrets stay out; CI keeps every tool from prompting.
	cmd.Env = withEnv(ChildEnv(os.Environ()), "CI=1", "COREPACK_ENABLE_DOWNLOAD_PROMPT=0")
	cmd.WaitDelay = 5 * time.Second
	return cmd.CombinedOutput()
}

var errSetupToolMissing = errors.New("tool not found")

// PrepareCheckout runs the checkout's setup steps and returns one plain notice per step for the run
// log. It never fails the run: a step that cannot run, fails or times out is said in plain words and
// the agent starts anyway, so the person sees why tests may not run instead of a stuck card.
func PrepareCheckout(ctx context.Context, dir string, run SetupRunner, now func() time.Time) []Event {
	if run == nil {
		run = runSetupStep
	}
	var events []Event
	note := func(text string) {
		events = append(events, Event{Kind: EvNotice, At: now().UTC().Format(time.RFC3339Nano), Text: clipText(text)})
	}
	for _, s := range SetupSteps(dir) {
		if s.Done != "" {
			if _, err := os.Lstat(filepath.Join(dir, s.Done)); err == nil {
				continue
			}
		}
		stepCtx, cancel := context.WithTimeout(ctx, SetupTimeout)
		start := now()
		out, err := run(stepCtx, dir, s)
		timedOut := errors.Is(stepCtx.Err(), context.DeadlineExceeded)
		cancel()
		switch {
		case errors.Is(err, errSetupToolMissing):
			note(fmt.Sprintf("Setup: skipped %q because %s is not installed on this computer. The agent starts without those packages.", s.command(), s.Bin))
		case ctx.Err() != nil:
			note("Setup: stopped because the run was stopped.")
			return events
		case timedOut:
			note(fmt.Sprintf("Setup: %q took longer than %s and was stopped. The agent starts anyway; tests that need those packages may not run.", s.command(), SetupTimeout))
		case err != nil:
			note(fmt.Sprintf("Setup: %q failed (%v). The agent starts anyway; tests that need those packages may not run. Last output: %s", s.command(), err, outputTail(out, 600)))
		default:
			note(fmt.Sprintf("Setup: installed from %s with %q in %s.", s.Lockfile, s.command(), now().Sub(start).Round(time.Second)))
		}
	}
	return events
}

// outputTail is the last n bytes of out, trimmed, on one line.
func outputTail(out []byte, n int) string {
	s := strings.TrimSpace(string(out))
	if len(s) > n {
		s = "…" + s[len(s)-n:]
	}
	return strings.Join(strings.Fields(s), " ")
}
