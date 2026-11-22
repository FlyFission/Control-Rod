package runner

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/flyfission/control-rod/daemon/internal/binaryutil"
)

type claudeAdapter struct{ sandboxedBase }

func (claudeAdapter) LoginDir(home string, getenv func(string) string) string {
	if v := getenv("CLAUDE_CONFIG_DIR"); v != "" {
		return v
	}
	return filepath.Join(home, ".claude")
}

func (claudeAdapter) LoginWritableFiles() []string { return []string{".credentials.json"} }

func (claudeAdapter) LoginSessionDirs() []string { return []string{"projects", "debug", "todos"} }

// CheckerEnv disables auto memory for this process. Claude Code's documented
// variable is CLAUDE_CODE_DISABLE_AUTO_MEMORY=1: when it is set, Claude does not
// create or load auto memory files (projects/<project>/memory/). It was not
// remeasured against a Claude Code binary here.
func (claudeAdapter) CheckerEnv() []string {
	return []string{"CLAUDE_CODE_DISABLE_AUTO_MEMORY=1"}
}

func (claudeAdapter) ID() string          { return RuntimeClaude }
func (claudeAdapter) Binary() string      { return "claude" }
func (claudeAdapter) DisplayName() string { return "Claude Code" }
func (claudeAdapter) BinarySpec() binaryutil.BinarySpec {
	return binaryutil.BinarySpec{
		Label:         "Claude Code",
		Names:         []string{"claude"},
		UnixPaths:     []string{"/opt/homebrew/bin/claude", "/usr/local/bin/claude"},
		UnixHomePaths: []string{".local/bin/claude", ".npm-global/bin/claude"},
		NodeManaged:   true,
	}
}
func (claudeAdapter) Family() string              { return "Anthropic" }
func (claudeAdapter) AuthorLaunchQualified() bool { return true }
func (claudeAdapter) ListOnSubscriptions() bool   { return true }

// AuthStatusArgs is Claude Code's own status command. Preflight already runs it.
func (claudeAdapter) AuthStatusArgs() []string { return []string{"auth", "status"} }

// ConfirmAuthCommand reports that this adapter's status command is the one
// Preflight runs. It does not parse help text.
func (claudeAdapter) ConfirmAuthCommand(func(args ...string) (string, int, error)) bool { return true }

func (claudeAdapter) Providers() []string {
	return []string{"claude", "anthropic", "claude-code"}
}

func (a claudeAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
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

func (a claudeAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	// id and binary are the same string. probeInstalled records the id and looks up the binary.
	return probeInstalled(ctx, a.ID(), a.Binary(), run, nil)
}

func (a claudeAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error) {
	return exec.Command(a.Binary(), ClaudeArgs(ws, RequestedModel(run), p, at)...), nil
}

func (claudeAdapter) LaunchInfo(run Run, ws *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.PermissionMode = ClaudePermissionMode
	l.AllowedTools = strings.Split(allowedTools(ws), ",")
	l.Sandbox = sandboxLabel(p)
	return l
}

func (claudeAdapter) ExtraEnv() []string { return ClaudeEnv }

func (claudeAdapter) ExtraHostNeeds() []HostNeed {
	return []HostNeed{{Program: "socat", Fix: "Install socat (on Ubuntu: `sudo apt install socat`)"}}
}

// PrepareHook records permission requests for the interim waiting detector.
func (claudeAdapter) PrepareHook(ws *Workspace, daemonHome, runID string) bool {
	hooks := filepath.Join(daemonHome, "hooks")
	if err := os.MkdirAll(hooks, 0o700); err != nil {
		return false
	}
	ws.HookFile = filepath.Join(hooks, runID+".jsonl")
	_ = os.Remove(ws.HookFile)
	return true
}

func (claudeAdapter) PreflightCLI(ctx context.Context, run CommandRunner) error {
	if _, code, err := run(ctx, claudeAdapter{}.Binary(), "auth", "status"); err != nil || code != 0 {
		return refuse("Claude Code is not signed in. Run `claude login`; Control Rod never signs in for you.")
	}
	return nil
}
