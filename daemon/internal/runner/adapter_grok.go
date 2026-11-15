package runner

import (
	"context"
	"errors"
	"os/exec"
	"path/filepath"
)

type grokAdapter struct{ sandboxedBase }

func (grokAdapter) LoginDir(home string, getenv func(string) string) string {
	if v := getenv("GROK_HOME"); v != "" {
		return v
	}
	return filepath.Join(home, ".grok")
}

func (grokAdapter) LoginWritableFiles() []string { return nil }
func (grokAdapter) LoginSessionDirs() []string   { return []string{"sessions", "logs"} }

func (grokAdapter) ID() string          { return RuntimeGrok }
func (grokAdapter) Binary() string      { return "grok" }
func (grokAdapter) DisplayName() string { return "Grok CLI" }
func (grokAdapter) Family() string      { return "xAI" }

func (grokAdapter) Providers() []string {
	return []string{"grok", "xai", "grok-cli"}
}

func (a grokAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
}

func (grokAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check", "intake"},
		OutputFormat:     "streaming-json",
		ToolAllowlist:    false,
		NativeSandbox:    "outer-sandbox",
		NetworkHostLimit: true,
		MultiVendor:      false,
		ConfigIsolation:  []string{"--sandbox", "--no-subagents", "GROK_HOME", "deny:auth.json"},
	}
}

func (a grokAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, a.ID(), a.Binary(), run, nil)
}

func (a grokAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, _ SandboxPaths) (*exec.Cmd, error) {
	if p == nil {
		return nil, errors.New("sandbox policy required")
	}
	args := []string{"-p", "--output-format", "streaming-json", "--sandbox", "--no-subagents"}
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

func (grokAdapter) LaunchInfo(run Run, _ *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	return l
}
