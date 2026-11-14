package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type fakeAdapter struct{}

func (fakeAdapter) ID() string     { return RuntimeFake }
func (fakeAdapter) Binary() string { return "bash" }

func (fakeAdapter) Providers() []string { return []string{"fake"} }

// Available offers the fake runtime only when CONTROLROD_ALLOW_FAKE=1. Detect does not look up
// Binary on PATH; bash is what a FAKE.sh script is started with.
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

func (fakeAdapter) Probe(context.Context, CommandRunner) RuntimeStatus {
	return RuntimeStatus{Runtime: RuntimeFake, Ready: true}
}

func (fakeAdapter) Command(_ Run, ws *Workspace, _ *SandboxPolicy, _ SandboxPaths) (*exec.Cmd, error) {
	script := filepath.Join(ws.Inputs, "FAKE.sh")
	if _, err := os.Stat(script); err != nil {
		return nil, nil
	}
	cmd := exec.Command("bash", script)
	return finishCommand(cmd, ws, ChildEnv(os.Environ())), nil
}

func (fakeAdapter) LaunchInfo(run Run, _ *Workspace, _ *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Mode = "fake"
	l.Sandbox = "none"
	return l
}

func (fakeAdapter) Normalize(line string, now time.Time) []Event { return Normalize(line, now) }
func (fakeAdapter) TurnEnd(line string) (bool, bool)             { return TurnEnd(line) }

func (fakeAdapter) SandboxRequired() bool      { return false }
func (fakeAdapter) UsesVerifiedLaunch() bool   { return false }
func (fakeAdapter) StagesArtifact() bool       { return false }
func (fakeAdapter) DisplayName() string        { return "fake" }
func (fakeAdapter) ExtraHostNeeds() []HostNeed { return nil }
func (fakeAdapter) CheckManagedConfig([]string) error {
	return nil
}
func (fakeAdapter) PrepareRun(*Workspace, string, string) (bool, []Event) { return false, nil }
func (fakeAdapter) PreflightCLI(context.Context, CommandRunner, func(context.Context) (string, error)) error {
	return nil
}
func (fakeAdapter) CopyOutputs(ws *Workspace) error { return CopyFakeOutputs(ws) }
