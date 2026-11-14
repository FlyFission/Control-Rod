package runner

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

type codexAdapter struct{}

func (codexAdapter) ID() string     { return RuntimeCodex }
func (codexAdapter) Binary() string { return "codex" }

func (codexAdapter) Providers() []string { return []string{"codex", "openai"} }

func (codexAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	_, err := lookPath("codex")
	return err == nil
}

func (codexAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check", "intake"},
		OutputFormat:     "json",
		ToolAllowlist:    false,
		NativeSandbox:    "permission-profile",
		NetworkHostLimit: false,
		MultiVendor:      false,
		ConfigIsolation:  []string{"--ignore-user-config", "--ignore-rules", "--ephemeral"},
	}
}

func (codexAdapter) Probe(ctx context.Context, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, RuntimeCodex, run, func(call func(args ...string) (string, int, error), st *RuntimeStatus) bool {
		help, hcode, herr := call("login", "--help")
		if herr == nil && hcode == 0 && hasSubcommand(help, "status") {
			st.LoginChecked = true
			if _, scode, serr := call("login", "status"); serr != nil || scode != 0 {
				st.Reason = fmt.Sprintf("codex is installed but not signed in (`codex login status` exit %d). Sign in yourself with `codex login`; Control Rod never does.", scode)
				return true
			}
		}
		return false
	})
}

func (codexAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error) {
	if err := requireAgentPolicy(p, at); err != nil {
		return nil, err
	}
	args, err := CodexArgs(ws, RequestedModel(run), p, at)
	if err != nil {
		return nil, err
	}
	cmd := exec.Command("codex", args...)
	return finishCommand(cmd, ws, AgentEnv(os.Environ())), nil
}

func (codexAdapter) LaunchInfo(run Run, _ *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	return l
}

func (codexAdapter) Normalize(line string, now time.Time) []Event { return Normalize(line, now) }
func (codexAdapter) TurnEnd(line string) (bool, bool)             { return TurnEnd(line) }

func (codexAdapter) SandboxRequired() bool    { return true }
func (codexAdapter) UsesVerifiedLaunch() bool { return true }
func (codexAdapter) StagesArtifact() bool     { return true }
func (codexAdapter) DisplayName() string      { return "Codex" }
func (codexAdapter) ExtraHostNeeds() []HostNeed {
	return nil
}
func (codexAdapter) CheckManagedConfig(files []string) error { return managedConfigRefusal(files) }
func (codexAdapter) CopyOutputs(ws *Workspace) error         { return CopyFakeOutputs(ws) }

func (codexAdapter) PrepareRun(*Workspace, string, string) (bool, []Event) {
	return false, []Event{{
		Kind: EvNotice,
		At:   time.Now().UTC().Format(time.RFC3339Nano),
		Text: "Permission waits are not observable in Codex exec mode; a refused action shows as a failed tool call.",
	}}
}

func (codexAdapter) PreflightCLI(ctx context.Context, run CommandRunner, features func(context.Context) (string, error)) error {
	if _, code, err := run(ctx, "codex", "login", "status"); err != nil || code != 0 {
		return refuse("Codex is not signed in. Run `codex login`; Control Rod never signs in for you.")
	}
	list, err := features(ctx)
	if err != nil {
		return refuse("Codex did not list its features (%v), so Control Rod cannot tell what an agent could reach. Reinstall the pinned Codex.", err)
	}
	if extra := unqualifiedCodexFeatures(list); len(extra) > 0 {
		return refuse("This Codex version turns on %s, which Control Rod has not qualified. Pin a qualified Codex version.", strings.Join(extra, ", "))
	}
	return nil
}
