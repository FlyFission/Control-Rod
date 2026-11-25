package runner

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
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
	if ws != nil && ws.Checker && a.SelfConfinedChecker() {
		if err := a.prepareIsolatedHome(ws); err != nil {
			return nil, fmt.Errorf("prepare Codex's disposable login home: %w", err)
		}
	}
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

// SelfConfinedChecker: on macOS a Codex checker is not wrapped in the outer Seatbelt profile.
// Codex runs every command, and since 0.172 even its AGENTS.md lookup, through a Seatbelt helper
// of its own, and Seatbelt profiles do not nest: inside the outer profile the helper fails with
// "sandbox_apply: Operation not permitted" (exit 71) and Codex stops before it reads the brief.
// Codex's own permission profile carries the checker's limits instead (CodexPolicyArgs for a
// checker): the filesystem is read-only except scratch, every denied path (the home folder, the
// login folders, the daemon's home) is unreadable, and commands get no network. The deliverable
// tree, the workspace and the protected login names are still hashed before and after, so any
// other write voids the check. Linux keeps the outer bubblewrap, where Codex's sandbox nests.
func (codexAdapter) SelfConfinedChecker() bool { return runtime.GOOS == "darwin" }

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

// prepareIsolatedHome gives a self-confined (macOS) Codex checker its own CODEX_HOME beside the
// workspace: a copy of auth.json and nothing else. Codex keeps its session rollout, its skill
// sync and its caches there, not in the real ~/.codex, so a check never writes the user's login
// folder. The folder is outside the workspace (the agent cannot write it) and is denied to the
// agent's commands by name (CodexPolicyArgs). Without a credential file to copy, the run keeps
// the real login folder and --ephemeral, and its model stays unknown.
func (a codexAdapter) prepareIsolatedHome(ws *Workspace) error {
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return nil
	}
	src := filepath.Join(a.LoginDir(home, os.Getenv), "auth.json")
	st, err := os.Lstat(src)
	if err != nil || !st.Mode().IsRegular() {
		return nil
	}
	cred, err := os.ReadFile(src)
	if err != nil {
		return nil
	}
	dir, err := canonicalPath(ws.Dir)
	if err != nil {
		return err
	}
	iso := dir + ".codexhome"
	removeStaleIsolatedHomes(iso)
	if err := os.RemoveAll(iso); err != nil {
		return err
	}
	if err := os.MkdirAll(iso, 0o700); err != nil {
		return err
	}
	ws.IsolatedLoginHome = iso
	ws.CredentialCopy = &credentialCopy{Host: src, Copy: filepath.Join(iso, "auth.json"), Original: cred}
	return os.WriteFile(ws.CredentialCopy.Copy, cred, 0o600)
}

// removeStaleIsolatedHomes deletes leftover *.codexhome folders from earlier runs beside keep:
// real directories owned by this user only, never keep itself.
func removeStaleIsolatedHomes(keep string) {
	parent := filepath.Dir(keep)
	entries, err := os.ReadDir(parent)
	if err != nil {
		return
	}
	for _, e := range entries {
		p := filepath.Join(parent, e.Name())
		if p == keep || !strings.HasSuffix(e.Name(), ".codexhome") {
			continue
		}
		st, err := os.Lstat(p)
		if err != nil || !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			continue
		}
		if !fileOwnedByUser(st) {
			continue
		}
		_ = os.RemoveAll(p)
	}
}

// PostRunModels reads the models Codex recorded for the run from the session rollout(s) under the
// run's disposable CODEX_HOME. The JSON stream never names the model; a rollout line of type
// turn_context carries it as payload.model. Names are cleaned like ReportedModel's. No rollout, or
// no model in it, gives nothing, and the model stays unknown.
func (codexAdapter) PostRunModels(home string) []string {
	if home == "" {
		return nil
	}
	set := map[string]struct{}{}
	_ = filepath.WalkDir(filepath.Join(home, "sessions"), func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(d.Name(), ".jsonl") || !d.Type().IsRegular() {
			return nil
		}
		f, err := os.Open(p)
		if err != nil {
			return nil
		}
		defer f.Close()
		r := bufio.NewReaderSize(f, 1<<20)
		for {
			line, rerr := r.ReadBytes('\n')
			if bytes.Contains(line, []byte(`"turn_context"`)) {
				var ev struct {
					Type    string `json:"type"`
					Payload struct {
						Model string `json:"model"`
					} `json:"payload"`
				}
				if json.Unmarshal(line, &ev) == nil && ev.Type == "turn_context" {
					if m := cleanModelName(ev.Payload.Model); m != "" {
						set[m] = struct{}{}
					}
				}
			}
			if rerr != nil {
				break
			}
		}
		return nil
	})
	out := make([]string, 0, len(set))
	for m := range set {
		out = append(out, m)
	}
	sort.Strings(out)
	return out
}
