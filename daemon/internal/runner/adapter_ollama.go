package runner

import (
	"context"
	"errors"
	"os/exec"
)

// PinnedOllamaHost enforces local-only loopback execution for Ollama.
const PinnedOllamaHost = "http://127.0.0.1:11434"

type ollamaAdapter struct{ sandboxedBase }

func (ollamaAdapter) ID() string          { return RuntimeOllama }
func (ollamaAdapter) Binary() string      { return "ollama" }
func (ollamaAdapter) DisplayName() string { return "Ollama (Local)" }
func (ollamaAdapter) Family() string      { return "Ollama-Local" }

func (ollamaAdapter) Providers() []string {
	return []string{"ollama", "local-ollama"}
}

func (a ollamaAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
}

func (ollamaAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "intake", "pre-check"},
		OutputFormat:     "text",
		ToolAllowlist:    false,
		NativeSandbox:    "outer-sandbox",
		NetworkHostLimit: true,
		MultiVendor:      false,
		ConfigIsolation:  []string{"OLLAMA_HOST=http://127.0.0.1:11434"},
	}
}

// ExtraEnv pins OLLAMA_HOST to 127.0.0.1:11434 so inherited env vars cannot route to remote hosts.
func (ollamaAdapter) ExtraEnv() []string {
	return []string{"OLLAMA_HOST=" + PinnedOllamaHost}
}

func (a ollamaAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, a.ID(), a.Binary(), run, nil)
}

func (a ollamaAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, _ SandboxPaths) (*exec.Cmd, error) {
	if p == nil {
		return nil, errors.New("sandbox policy required")
	}
	model := RequestedModel(run)
	if model == "" {
		model = "llama3.1"
	}
	prompt := Prompt
	if run.Role == "pre-check" {
		prompt = CheckerPrompt
	}
	cmd := exec.Command(a.Binary(), "run", model, prompt)
	cmd.Dir = ws.Dir
	return cmd, nil
}

func (ollamaAdapter) LaunchInfo(run Run, _ *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	return l
}
