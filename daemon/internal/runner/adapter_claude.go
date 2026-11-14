package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type claudeAdapter struct{}

func (claudeAdapter) ID() string     { return RuntimeClaude }
func (claudeAdapter) Binary() string { return "claude" }

func (claudeAdapter) Providers() []string {
	return []string{"claude", "anthropic", "claude-code"}
}

func (claudeAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	_, err := lookPath("claude")
	return err == nil
}

func (claudeAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check", "intake"},
		OutputFormat:     "stream-json",
		ToolAllowlist:    true,
		NativeSandbox:    "command-sandbox",
		NetworkHostLimit: true,
		MultiVendor:      false,
		ConfigIsolation: []string{
			"--restricted", "--strict-mcp-config", "--mcp-config", "--setting-sources",
			"--disable-slash-commands", "--no-session-persistence",
		},
	}
}

func (claudeAdapter) Probe(ctx context.Context, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, RuntimeClaude, run, nil)
}

func (claudeAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error) {
	if err := requireAgentPolicy(p, at); err != nil {
		return nil, err
	}
	cmd := exec.Command("claude", ClaudeArgs(ws, RequestedModel(run), p, at)...)
	return finishCommand(cmd, ws, withEnv(AgentEnv(os.Environ()), ClaudeEnv...)), nil
}

func (claudeAdapter) LaunchInfo(run Run, ws *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.PermissionMode = ClaudePermissionMode
	l.AllowedTools = strings.Split(allowedTools(ws), ",")
	l.Sandbox = sandboxLabel(p)
	return l
}

func (claudeAdapter) Normalize(line string, now time.Time) []Event { return Normalize(line, now) }
func (claudeAdapter) TurnEnd(line string) (bool, bool)             { return TurnEnd(line) }

func (claudeAdapter) SandboxRequired() bool    { return true }
func (claudeAdapter) UsesVerifiedLaunch() bool { return true }
func (claudeAdapter) StagesArtifact() bool     { return false }
func (claudeAdapter) DisplayName() string      { return "Claude Code" }
func (claudeAdapter) CheckManagedConfig([]string) error {
	return nil
}

func (claudeAdapter) ExtraHostNeeds() []HostNeed {
	return []HostNeed{{Program: "socat", Fix: "Install socat (on Ubuntu: `sudo apt install socat`)"}}
}

func (claudeAdapter) CopyOutputs(ws *Workspace) error { return CopyFakeOutputs(ws) }

// PrepareRun records permission requests for the interim waiting detector. The caller removes the
// file when the run ends.
func (claudeAdapter) PrepareRun(ws *Workspace, daemonHome, runID string) (bool, []Event) {
	hooks := filepath.Join(daemonHome, "hooks")
	if err := os.MkdirAll(hooks, 0o700); err == nil {
		ws.HookFile = filepath.Join(hooks, runID+".jsonl")
		_ = os.Remove(ws.HookFile)
		return true, nil
	}
	return false, nil
}

func (claudeAdapter) PreflightCLI(ctx context.Context, run CommandRunner, _ func(context.Context) (string, error)) error {
	if _, code, err := run(ctx, "claude", "auth", "status"); err != nil || code != 0 {
		return refuse("Claude Code is not signed in. Run `claude login`; Control Rod never signs in for you.")
	}
	return nil
}
