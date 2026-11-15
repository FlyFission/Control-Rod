package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
)

type fakeAdapter struct{ streamBase }

func (fakeAdapter) ID() string                { return RuntimeFake }
func (fakeAdapter) Binary() string            { return "bash" }
func (fakeAdapter) DisplayName() string       { return "fake" }
func (fakeAdapter) ListOnSubscriptions() bool { return false }

func (fakeAdapter) Providers() []string { return []string{"fake"} }

// Available offers the fake runtime only when CONTROLROD_ALLOW_FAKE=1. It does not look up
// Binary: bash is the interpreter for inputs/FAKE.sh, and requiring it on PATH would change
// which machines Detect offers the fake runtime to.
func (fakeAdapter) Available(_ func(string) (string, error), getenv func(string) string) bool {
	return getenv("CONTROLROD_ALLOW_FAKE") == "1"
}

func (fakeAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check", "intake"},
		OutputFormat:     "text",
		ToolAllowlist:    false,
		NativeSandbox:    "none",
		NetworkHostLimit: false,
		MultiVendor:      false,
	}
}

func (fakeAdapter) SandboxRequired() bool { return false }

func (fakeAdapter) Probe(_ context.Context, version string, _ CommandRunner) RuntimeStatus {
	return RuntimeStatus{Runtime: RuntimeFake, Ready: true, Version: version}
}

func (a fakeAdapter) Command(_ Run, ws *Workspace, _ *SandboxPolicy, _ SandboxPaths) (*exec.Cmd, error) {
	script := filepath.Join(ws.Inputs, "FAKE.sh")
	if _, err := os.Stat(script); err != nil {
		return nil, nil
	}
	return exec.Command(a.Binary(), script), nil
}

func (fakeAdapter) LaunchInfo(run Run, _ *Workspace, _ *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Mode = "fake"
	l.Sandbox = "none"
	return l
}

func (fakeAdapter) CopyOutputs(ws *Workspace) error { return CopyFakeOutputs(ws) }
