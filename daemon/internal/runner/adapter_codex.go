package runner

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"
)

// codexFeatureName is what a feature name from `codex features list` must look like before it is
// passed back to Codex as an argument.
var codexFeatureName = regexp.MustCompile(`^[a-z][a-z0-9_]{0,79}$`)

type codexAdapter struct {
	sandboxedBase
	// features is the lister for one preflight. Nil means CodexEffectiveFeatures.
	// The registry value stays nil; withFeatures returns a copy.
	features CodexFeatureLister
}

func (a codexAdapter) withFeatures(f CodexFeatureLister) codexSwitchPreflight {
	if f != nil {
		a.features = f
	}
	return a
}

func (codexAdapter) LoginDir(home string, getenv func(string) string) string {
	if v := getenv("CODEX_HOME"); v != "" {
		return v
	}
	return filepath.Join(home, ".codex")
}

// UsageLogDir is where Codex writes its session logs, which carry its rate-limit snapshots.
func (a codexAdapter) UsageLogDir(home string, getenv func(string) string) string {
	return filepath.Join(a.LoginDir(home, getenv), "sessions")
}

func (codexAdapter) LoginWritableFiles() []string { return []string{"auth.json"} }

func (codexAdapter) LoginSessionDirs() []string { return []string{"sessions", "log"} }

// IsolatedLoginHomeEnv names the env var used to point a checker run at a per-run writable
// directory containing only the bound credential file, keeping the host login directory read-only.
func (codexAdapter) IsolatedLoginHomeEnv() string { return "CODEX_HOME" }

func (codexAdapter) ID() string                  { return RuntimeCodex }
func (codexAdapter) Binary() string              { return "codex" }
func (codexAdapter) DisplayName() string         { return "Codex" }
func (codexAdapter) Family() string              { return "OpenAI" }
func (codexAdapter) AuthorLaunchQualified() bool { return true }
func (codexAdapter) ListOnSubscriptions() bool   { return true }

// AuthStatusArgs is Codex's own login status command.
func (codexAdapter) AuthStatusArgs() []string { return []string{"login", "status"} }

// ConfirmAuthCommand is true only when `codex login --help` lists `status`.
// A Codex build without that subcommand is reported as auth unknown.
func (codexAdapter) ConfirmAuthCommand(call func(args ...string) (string, int, error)) bool {
	help, code, err := call("login", "--help")
	return err == nil && code == 0 && hasSubcommand(help, "status")
}

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
	st := probeInstalled(ctx, a.ID(), a.Binary(), run, func(call func(args ...string) (string, int, error), st *RuntimeStatus) bool {
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
	if st.Ready {
		home, _ := os.UserHomeDir()
		st.Models = discoverCodexModels(home, os.Getenv)
	}
	return st
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

// PreflightCLI is the preflight for a caller that cannot carry switches to the launch: any feature
// Control Rod has not qualified is refused, as before. Preflight uses PreflightSwitches instead.
func (a codexAdapter) PreflightCLI(ctx context.Context, run CommandRunner) error {
	off, err := a.PreflightSwitches(ctx, run)
	if err == nil && len(off) > 0 {
		return refuse("This Codex version turns on %s, which Control Rod has not qualified.", strings.Join(off, ", "))
	}
	return err
}

// PreflightSwitches checks the sign-in and Codex's features. A feature a newer Codex turns on that
// Control Rod has not qualified is switched off, not refused: the list is read again with it
// switched off, and only when Codex then reports it off is it returned, for every launch of this
// artifact to pass as one more --disable (Workspace.CodexSwitchedOff). One that stays on is refused.
func (a codexAdapter) PreflightSwitches(ctx context.Context, run CommandRunner) ([]string, error) {
	if _, code, err := run(ctx, a.Binary(), "login", "status"); err != nil || code != 0 {
		return nil, refuse("Codex is not signed in. Run `codex login`; Control Rod never signs in for you.")
	}
	listFn := a.features
	if listFn == nil {
		listFn = CodexEffectiveFeatures
	}
	list, err := listFn(ctx, nil)
	if err != nil {
		return nil, refuse("Codex did not list its features (%v), so Control Rod cannot tell what an agent could reach. Reinstall Codex.", err)
	}
	extra := unqualifiedCodexFeatures(list)
	if len(extra) == 0 {
		return nil, nil
	}
	for _, f := range extra {
		if !codexFeatureName.MatchString(f) {
			return nil, refuse("Codex listed its features in a form Control Rod cannot read (%s), so it cannot tell what an agent could reach.", f)
		}
	}
	again, err := listFn(ctx, extra)
	if err != nil {
		return nil, refuse("Codex did not list its features with %s switched off (%v), so Control Rod cannot tell what an agent could reach.", strings.Join(extra, ", "), err)
	}
	still := unqualifiedCodexFeatures(again)
	// Each switched feature must be listed again, and as off: a row that disappeared proves nothing.
	off := codexFeaturesOff(again)
	for _, f := range extra {
		if !off[f] && !slices.Contains(still, f) {
			still = append(still, f)
		}
	}
	if len(still) > 0 {
		sort.Strings(still)
		return nil, refuse("This Codex version turns on %s, which Control Rod has not qualified, and Codex did not report it off when asked to switch it off.", strings.Join(still, ", "))
	}
	return extra, nil
}

// codexFeaturesOff names the features a `codex features list` reports off.
func codexFeaturesOff(list string) map[string]bool {
	off := map[string]bool{}
	for _, line := range strings.Split(list, "\n") {
		if f := strings.Fields(line); len(f) >= 3 && f[len(f)-1] == "false" {
			off[f[0]] = true
		}
	}
	return off
}
