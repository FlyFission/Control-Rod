package runner

import (
	"context"
	"errors"
	"os/exec"

	"github.com/flyfission/control-rod/daemon/internal/binaryutil"
)

type opencodeAdapter struct{ sandboxedBase }

// ConfinementGap keeps this runtime listed but never started; see AwaitingConfinement.
func (opencodeAdapter) ConfinementGap() string {
	return "Control Rod does not yet configure OpenCode's permissions from the run's policy or wrap it in a sandbox, and OpenCode's model vendor depends on its own configuration, so the run's disclosure lane cannot be checked."
}

func (opencodeAdapter) ID() string          { return RuntimeOpenCode }
func (opencodeAdapter) Binary() string      { return "opencode" }
func (opencodeAdapter) DisplayName() string { return "OpenCode" }
func (opencodeAdapter) BinarySpec() binaryutil.BinarySpec {
	return binaryutil.BinarySpec{
		Label:         "OpenCode",
		Names:         []string{"opencode"},
		UnixPaths:     []string{"/opt/homebrew/bin/opencode", "/usr/local/bin/opencode"},
		UnixHomePaths: []string{".local/bin/opencode", ".opencode/bin/opencode", ".npm-global/bin/opencode"},
		NodeManaged:   true,
	}
}
func (opencodeAdapter) Family() string { return "OpenCode" }

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
		NativeSandbox:    "none",
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
