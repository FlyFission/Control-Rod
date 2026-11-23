package runner

import (
	"context"
	"errors"
	"os/exec"
	"path/filepath"
)

type agyAdapter struct{ sandboxedBase }

// ConfinementGap keeps this runtime listed but never started; see AwaitingConfinement.
func (agyAdapter) ConfinementGap() string {
	return "Control Rod does not yet configure Antigravity's sandbox from the run's policy or wrap it in one, and its headless launch form has not been checked against a pinned version."
}

func (agyAdapter) ID() string          { return RuntimeAgy }
func (agyAdapter) Binary() string      { return "agy" }
func (agyAdapter) DisplayName() string { return "Antigravity CLI" }
func (agyAdapter) Family() string      { return "Google" }

func (agyAdapter) Providers() []string {
	return []string{"agy", "antigravity", "gemini-cli"}
}

func (a agyAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
}

func (agyAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check", "intake"},
		OutputFormat:     "json",
		ToolAllowlist:    false,
		NativeSandbox:    "none",
		NetworkHostLimit: true,
		MultiVendor:      false,
		ConfigIsolation:  []string{"--brain-dir", "per-run-brain"},
	}
}

func (a agyAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, a.ID(), a.Binary(), run, nil)
}

func (a agyAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, _ SandboxPaths) (*exec.Cmd, error) {
	if p == nil {
		return nil, errors.New("sandbox policy required")
	}
	brainDir := filepath.Join(ws.Dir, "scratch", "agy-brain")
	args := []string{"run", "--brain-dir", brainDir, "--output-format", "json"}
	if m := RequestedModel(run); m != "" {
		args = append(args, "--model", m)
	}
	prompt := Prompt
	if run.Role == "pre-check" {
		prompt = CheckerPrompt
	}
	args = append(args, prompt)
	cmd := exec.Command(a.Binary(), args...)
	cmd.Dir = ws.Dir
	return cmd, nil
}

func (agyAdapter) LaunchInfo(run Run, _ *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	return l
}
