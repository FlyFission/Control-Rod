package runner

import (
	"context"
	"errors"
	"os/exec"
)

type opencodeAdapter struct{ sandboxedBase }

func (opencodeAdapter) ID() string          { return RuntimeOpenCode }
func (opencodeAdapter) Binary() string      { return "opencode" }
func (opencodeAdapter) DisplayName() string { return "OpenCode" }
func (opencodeAdapter) Family() string      { return "OpenCode" }

func (opencodeAdapter) Providers() []string {
	return []string{"opencode"}
}

func (a opencodeAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
}

func (opencodeAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check", "intake"},
		OutputFormat:     "json",
		ToolAllowlist:    false,
		NativeSandbox:    "outer-sandbox",
		NetworkHostLimit: true,
		MultiVendor:      true,
		ConfigIsolation:  []string{"OPENCODE_CONFIG"},
	}
}

func (a opencodeAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, a.ID(), a.Binary(), run, nil)
}

func (a opencodeAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, _ SandboxPaths) (*exec.Cmd, error) {
	if p == nil {
		return nil, errors.New("sandbox policy required")
	}
	args := []string{"run", "--format", "json"}
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

func (opencodeAdapter) LaunchInfo(run Run, _ *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	return l
}
