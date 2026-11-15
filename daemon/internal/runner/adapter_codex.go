package runner

import (
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type codexAdapter struct {
	sandboxedBase
	// features is the lister for one preflight. Nil means CodexEffectiveFeatures.
	// The registry value stays nil; withFeatures returns a copy.
	features func(context.Context) (string, error)
}

func (a codexAdapter) withFeatures(f func(context.Context) (string, error)) CLIPreflight {
	if f != nil {
		a.features = f
	}
	return a
}

func (codexAdapter) ID() string          { return RuntimeCodex }
func (codexAdapter) Binary() string      { return "codex" }
func (codexAdapter) DisplayName() string { return "Codex" }

func (codexAdapter) Providers() []string { return []string{"codex", "openai"} }

func (a codexAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
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

func (a codexAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, a.ID(), a.Binary(), run, func(call func(args ...string) (string, int, error), st *RuntimeStatus) bool {
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

func (a codexAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error) {
	args, err := CodexArgs(ws, RequestedModel(run), p, at)
	if err != nil {
		return nil, err
	}
	return exec.Command(a.Binary(), args...), nil
}

func (codexAdapter) LaunchInfo(run Run, _ *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	return l
}

func (codexAdapter) StagesArtifact() bool { return true }

func (codexAdapter) CheckManagedConfig(files []string) error { return managedConfigRefusal(files) }

func (codexAdapter) LaunchNotice(now time.Time) []Event {
	return []Event{{
		Kind: EvNotice,
		At:   now.UTC().Format(time.RFC3339Nano),
		Text: "Permission waits are not observable in Codex exec mode; a refused action shows as a failed tool call.",
	}}
}

func (a codexAdapter) PreflightCLI(ctx context.Context, run CommandRunner) error {
	if _, code, err := run(ctx, a.Binary(), "login", "status"); err != nil || code != 0 {
		return refuse("Codex is not signed in. Run `codex login`; Control Rod never signs in for you.")
	}
	listFn := a.features
	if listFn == nil {
		listFn = CodexEffectiveFeatures
	}
	list, err := listFn(ctx)
	if err != nil {
		return refuse("Codex did not list its features (%v), so Control Rod cannot tell what an agent could reach. Reinstall the pinned Codex.", err)
	}
	if extra := unqualifiedCodexFeatures(list); len(extra) > 0 {
		return refuse("This Codex version turns on %s, which Control Rod has not qualified. Pin a qualified Codex version.", strings.Join(extra, ", "))
	}
	return nil
}
