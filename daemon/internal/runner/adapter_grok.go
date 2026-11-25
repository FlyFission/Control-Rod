package runner

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"time"
)

// grokAdapter runs Grok CLI through Control Rod's ACP bridge (change record grok-seat). Grok's
// headless mode has no sandbox Control Rod can configure, so the daemon starts its own hidden
// `grok-bridge` command instead, which speaks the Agent Client Protocol to `grok agent stdio`:
//
//   - Grok itself runs under a Seatbelt profile that lets it read only its program, its login files,
//     the workspace and a per-run home, write only that home and its own session logs, and reach the
//     network only through a local proxy that allows Grok's own hosts.
//   - Its session gets an agent profile whose tool allowlist holds only the shell, read, write and
//     edit tools, and a pre-tool hook answered by the bridge that refuses every other tool.
//   - Those four tools are delegated to the bridge: each command and each file read or write runs
//     under a second, tighter Seatbelt profile (no login files, no network, writes only where the
//     role may write).
//
// Measured with Grok CLI 1.0.92 on macOS (verification E-01 to E-08).
type grokAdapter struct{ sandboxedBase }

func (grokAdapter) LoginDir(home string, getenv func(string) string) string {
	if v := getenv("GROK_HOME"); v != "" {
		return v
	}
	return filepath.Join(home, ".grok")
}

func (grokAdapter) LoginWritableFiles() []string { return nil }
func (grokAdapter) LoginSessionDirs() []string   { return []string{"sessions", "logs"} }

// ConfinementGap is empty on macOS, the one platform the bridge's Seatbelt profiles were measured
// on. Elsewhere the runtime stays listed and is never started.
func (grokAdapter) ConfinementGap() string {
	if runtime.GOOS == "darwin" {
		return ""
	}
	return "Control Rod fences Grok CLI with macOS Seatbelt profiles; on this platform it has no fence for Grok's own file tools, so Grok is not started here."
}

func (grokAdapter) ID() string                  { return RuntimeGrok }
func (grokAdapter) Binary() string              { return "grok" }
func (grokAdapter) DisplayName() string         { return "Grok CLI" }
func (grokAdapter) Family() string              { return "xAI" }
func (grokAdapter) AuthorLaunchQualified() bool { return runtime.GOOS == "darwin" }
func (grokAdapter) ListOnSubscriptions() bool   { return true }

func (grokAdapter) Providers() []string {
	return []string{"grok", "xai", "grok-cli"}
}

func (a grokAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
}

func (grokAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check", "intake"},
		OutputFormat:     "grok-bridge",
		ToolAllowlist:    true,
		NativeSandbox:    "none",
		NetworkHostLimit: true,
		MultiVendor:      false,
		ConfigIsolation:  []string{"grok-bridge", "agentProfile.tools", "x.ai/hooks", "HOME", "seatbelt"},
	}
}

// grokTestedVersion is the Grok CLI build the bridge was qualified on: the tool ids the allowlist
// names, the hook method and the log line that proves the allowlist took effect were measured on
// it. It and every newer build are seated (agent_version.go); a newer build that changed any of
// them fails its run closed (allowlistApplied, the hook's allowlist), it does not run unfenced.
const grokTestedVersion = "1.0.92"

func grokQualifiedVersion(v string) bool {
	ok, _ := agentVersionAtLeast(v, grokTestedVersion)
	return ok
}

func grokVersionReason(v string) string {
	if agyVersionRE.FindStringSubmatch(v) == nil {
		return fmt.Sprintf("Control Rod could not read a version from %s (%q), so it is not seated.", "Grok CLI", v)
	}
	return fmt.Sprintf("Grok CLI %q is installed, but it is older than %s, the first version Control Rod can fence. Update Grok CLI.", v, grokTestedVersion)
}

// grokSignedIn reads `grok models`, which exits 0 whether or not a login is present: its first
// line says which (measured with 1.0.92: "You are logged in with grok.com." or "You are not
// authenticated.").
func grokSignedIn(out string) bool {
	return strings.HasPrefix(firstLine(out), "You are logged in")
}

var grokModelLine = regexp.MustCompile(`^\s*[*-]\s+([a-z0-9][a-z0-9._-]*)`)

// grokModels reads the model ids `grok models` lists ("  * grok-4.7 (default)", "  - grok-4.6").
func grokModels(out string) []string {
	var ms []string
	for _, line := range strings.Split(out, "\n") {
		if m := grokModelLine.FindStringSubmatch(line); m != nil && !slices.Contains(ms, m[1]) {
			ms = append(ms, m[1])
		}
	}
	return ms
}

func (a grokAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, a.ID(), a.Binary(), run, func(call func(args ...string) (string, int, error), st *RuntimeStatus) bool {
		out, code, err := call("models")
		st.LoginChecked = err == nil && code == 0
		if err != nil || code != 0 || !grokSignedIn(out) {
			st.Reason = "grok is installed but not signed in. Sign in yourself by running `grok` once; Control Rod never does."
			return true
		}
		st.Models = grokModels(out)
		if !grokQualifiedVersion(st.Version) {
			st.Reason = grokVersionReason(st.Version)
			return true
		}
		if _, newer := agentVersionAtLeast(st.Version, grokTestedVersion); newer {
			st.Note = newerThanTestedNote("Grok CLI", st.Version, grokTestedVersion)
		}
		return false
	})
}

func (grokAdapter) PreflightCLI(ctx context.Context, run CommandRunner) error {
	if _, err := os.Stat("/usr/bin/sandbox-exec"); err != nil {
		return refuse("Seatbelt (sandbox-exec) is not available, so Grok CLI cannot be fenced.")
	}
	if out, code, err := run(ctx, grokAdapter{}.Binary(), "--version"); err != nil || code != 0 || !grokQualifiedVersion(firstLine(out)) {
		return refuse("%s", grokVersionReason(firstLine(out)))
	}
	if out, code, err := run(ctx, grokAdapter{}.Binary(), "models"); err != nil || code != 0 || !grokSignedIn(out) {
		return refuse("Grok CLI is not signed in. Run `grok` once and sign in; Control Rod never signs in for you.")
	}
	return nil
}

// grokXAIModel: Grok CLI runs are recorded as the xAI family, so only Grok models may run.
func grokXAIModel(m string) bool { return strings.HasPrefix(m, "grok-") }

func (grokAdapter) ModelAllowed(m string) bool { return grokXAIModel(m) }

// ExitStatusUntrusted: the bridge reports the turn in its result line, and a run without one fails.
func (grokAdapter) ExitStatusUntrusted() bool { return true }

// SelfConfinedChecker: a Grok checker is not wrapped in the outer checker profile, because the
// bridge must start Grok and each command under profiles of their own and Seatbelt profiles do not
// nest. The bridge's command profile carries the checker's limits (writes only to the verdict files
// and the evidence folder), the Grok process may not write the workspace at all, and the
// deliverable tree and the workspace are still hashed before and after.
func (grokAdapter) SelfConfinedChecker() bool { return true }

func (a grokAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error) {
	cfg, err := grokBridgeFor(run, ws, p, at)
	if err != nil {
		return nil, err
	}
	self, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("the daemon cannot find its own program to start the Grok bridge: %w", err)
	}
	if real, err := filepath.EvalSymlinks(self); err == nil {
		self = real
	}
	raw, err := json.Marshal(cfg)
	if err != nil {
		return nil, err
	}
	// The grok argv after "--" starts with the bare name; launch by digest puts the verified path
	// there (VerifiedLaunch.Apply), and the bridge refuses a name that is not an absolute path.
	args := []string{grokBridgeCommand, grokBridgeConfigFlag + base64.StdEncoding.EncodeToString(raw), "--", a.Binary(), "agent", "--always-approve"}
	if m := RequestedModel(run); m != "" {
		args = append(args, "-m", m)
	}
	args = append(args, "--no-leader", "--debug-file", filepath.Join(cfg.RunHome, grokDebugLog), "stdio")
	return exec.Command(self, args...), nil
}

// grokBridgeFor checks the run against what the bridge can fence and returns its settings. It
// makes the run home.
func grokBridgeFor(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*grokBridgeConfig, error) {
	if p == nil {
		return nil, errors.New("sandbox policy required")
	}
	if ws == nil {
		return nil, errors.New("Grok CLI needs a workspace")
	}
	if ws.Checkout != nil {
		return nil, refuse("Grok CLI cannot work in a repository checkout yet: its commands are fenced to the workspace folder, and a checkout's history lives outside it. It can check work and do tasks that need no checkout.")
	}
	if len(p.AllowedHosts) > 0 || NeedsNetwork(ws) {
		return nil, refuse("Grok CLI's commands run with no network here, so it cannot run a role that needs network.")
	}
	for _, t := range []string{"command", "read", "edit", "write", "search"} {
		if !slices.Contains(p.EnabledTools, t) {
			return nil, fmt.Errorf("Grok CLI cannot run without its %s tool, so it cannot run under this policy", t)
		}
	}
	if m := RequestedModel(run); m != "" && !grokXAIModel(m) {
		return nil, refuse("Grok CLI runs here only on Grok models, so its work counts as xAI's; %q is another vendor's model.", m)
	}
	dir, err := canonicalPath(ws.Dir)
	if err != nil {
		return nil, fmt.Errorf("the workspace cannot be resolved (%v), so Grok CLI cannot be fenced", err)
	}
	denied, err := p.DeniedChecked(at)
	if err != nil {
		return nil, err
	}
	var deny []string
	for _, d := range denied {
		c, err := canonicalPath(d)
		if err != nil {
			return nil, fmt.Errorf("cannot resolve %s (%v), so Grok CLI cannot be fenced", d, err)
		}
		if within(c, dir) {
			continue
		}
		deny = append(deny, c)
	}
	// The login folder is denied wherever it lives (GROK_HOME can point anywhere): commands and
	// delegated file reads never see it, and only the Grok process reopens the named files it needs.
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		return nil, errors.New("the home folder cannot be resolved, so Grok CLI's login cannot be found")
	}
	grokHome, err := canonicalPath(grokAdapter{}.LoginDir(home, os.Getenv))
	if err != nil {
		return nil, err
	}
	if within(dir, grokHome) || within(grokHome, dir) {
		return nil, refuse("The workspace and Grok CLI's login folder %s overlap, so the login could not be kept from the run.", grokHome)
	}
	// Links in the login folder are denied at their targets too (hiding the folder hides the link,
	// not what it points to). The Grok process reads its named files by their real paths, so one
	// that links outside the folder would be denied to Grok as well: such a layout is refused.
	logins, err := (&SandboxPolicy{}).DeniedChecked(SandboxPaths{Logins: []string{grokHome}})
	if err != nil {
		return nil, err
	}
	for _, l := range logins {
		if within(dir, l) || within(l, dir) {
			return nil, refuse("Grok CLI's login links to %s, which overlaps the workspace, so the login could not be kept from the run.", l)
		}
		if !slices.ContainsFunc(deny, func(d string) bool { return within(l, d) }) {
			deny = append(deny, l)
		}
	}
	for _, name := range append(slices.Clone(grokHomeReadFiles), grokHomeReadDirs...) {
		real, err := filepath.EvalSymlinks(filepath.Join(grokHome, name))
		if err == nil && !within(real, grokHome) {
			return nil, refuse("Grok CLI's %s links outside its login folder (%s). Control Rod fences only a login kept in one folder; move the file into %s to run Grok.", name, real, grokHome)
		}
	}
	slices.Sort(deny)
	deny = slices.Compact(deny)
	// Grok loads AGENTS.md, CLAUDE.md and .grok/ from the folders it works in. Any folder the
	// policy denies is unreadable to Grok, so only the others count; one planted there is refused.
	hits, err := upwardInstructionHits(dir)
	if err != nil {
		return nil, err
	}
	var loaded []string
	for _, h := range hits {
		if !slices.ContainsFunc(deny, func(d string) bool { return within(h, d) }) {
			loaded = append(loaded, h)
		}
	}
	if len(loaded) > 0 {
		return nil, refuse("Grok CLI would load configuration from %s. Remove it to run Grok.", strings.Join(loaded, ", "))
	}
	// Other runs' folders in the shared temporary folders (checker workspaces, Antigravity run
	// folders, checker temporary folders) are unreadable; this run's own workspace is reopened.
	var prefixes []string
	for _, tmp := range []string{"/var/tmp", os.TempDir()} {
		c, err := canonicalPath(tmp)
		if err != nil || !safePrefix.MatchString(c) {
			return nil, fmt.Errorf("the temporary folder %s cannot be fenced for Grok CLI (%v)", tmp, err)
		}
		if !slices.Contains(prefixes, c+"/controlrod-") {
			prefixes = append(prefixes, c+"/controlrod-")
		}
	}
	cfg := &grokBridgeConfig{Workspace: dir, GrokHome: grokHome, Denied: deny, DeniedPrefixes: prefixes, Checker: ws.Checker,
		Hosts: authorEgressHosts(RuntimeGrok, p), Prompt: Prompt}
	if ws.Checker {
		files, evidence, err := checkerWriteTargets(ws)
		if err != nil {
			return nil, err
		}
		for _, f := range files {
			c, err := canonicalPath(f)
			if err != nil {
				return nil, err
			}
			cfg.WriteFiles = append(cfg.WriteFiles, c)
		}
		c, err := canonicalPath(evidence)
		if err != nil {
			return nil, err
		}
		cfg.WriteDirs = []string{c}
		cfg.Prompt = CheckerPrompt
	} else {
		cfg.WriteDirs = []string{dir}
	}
	runHome, err := makeGrokRunHome(dir)
	if err != nil {
		return nil, fmt.Errorf("prepare Grok's run home: %w", err)
	}
	ws.RunHome = runHome
	cfg.RunHome = runHome
	return cfg, nil
}

// makeGrokRunHome makes the run's own home folder beside the workspace: Grok's HOME (so none of
// the user's ~/.claude, ~/.cursor or ~/.codex sources load; the login stays in GROK_HOME), its
// temporary folder, and a separate folder the commands use as their home. Commands cannot read
// the rest of it.
func makeGrokRunHome(dir string) (string, error) {
	home := dir + ".home"
	if err := os.RemoveAll(home); err != nil {
		return "", err
	}
	for _, sub := range []string{"", grokTmpDir, filepath.Join(grokTermDir, "tmp")} {
		if err := os.MkdirAll(filepath.Join(home, sub), 0o700); err != nil {
			return "", err
		}
	}
	return home, nil
}

func (grokAdapter) LaunchInfo(run Run, ws *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	l.AllowedTools = slices.Clone(grokAllowedTools)
	return l
}

// The bridge's stream is its own shape: {"grok_bridge": "init" | "tool" | "message" | "result", ...}.

type grokLine struct {
	Kind   string          `json:"grok_bridge"`
	Model  string          `json:"model,omitempty"`
	ID     string          `json:"id,omitempty"`
	Name   string          `json:"name,omitempty"`
	State  string          `json:"state,omitempty"`
	Input  json.RawMessage `json:"input,omitempty"`
	Text   string          `json:"text,omitempty"`
	OK     *bool           `json:"ok,omitempty"`
	Reason string          `json:"reason,omitempty"`
	Usage  *grokUsage      `json:"usage,omitempty"`
}

type grokUsage struct {
	Input  *int `json:"input_tokens,omitempty"`
	Output *int `json:"output_tokens,omitempty"`
	Cached *int `json:"cache_read_tokens,omitempty"`
}

func parseGrok(line string) (grokLine, bool) {
	var l grokLine
	t := strings.TrimSpace(line)
	if !strings.HasPrefix(t, "{") || json.Unmarshal([]byte(t), &l) != nil || l.Kind == "" {
		return grokLine{}, false
	}
	return l, true
}

func (grokAdapter) TurnEnd(line string) (bool, bool) {
	l, ok := parseGrok(line)
	if !ok || l.Kind != "result" {
		return false, false
	}
	return true, l.OK == nil || !*l.OK
}

func (grokAdapter) Normalize(line string, now time.Time) []Event {
	l, ok := parseGrok(line)
	if !ok {
		return nil
	}
	at := now.UTC().Format(time.RFC3339Nano)
	switch l.Kind {
	case "tool":
		var input map[string]any
		_ = json.Unmarshal(l.Input, &input)
		switch l.State {
		case "start":
			return []Event{{Kind: EvToolStart, At: at, Tool: token(l.Name, 60), Summary: toolLabel(l.Name, input),
				InputDigest: digestOf(input), CallID: token(l.ID, 120)}}
		case "done", "error":
			e := Event{Kind: EvToolEnd, At: at, Tool: token(l.Name, 60), CallID: token(l.ID, 120), OK: yes(l.State == "done")}
			if l.Text != "" {
				e.Text = clipText(l.Text)
			}
			return []Event{e}
		}
	case "message":
		if l.Text != "" {
			return []Event{{Kind: EvMessage, At: at, Text: clipText(l.Text)}}
		}
	case "result":
		var out []Event
		if l.OK == nil || !*l.OK {
			why := l.Reason
			if why == "" {
				why = "Grok stopped before finishing"
			}
			out = append(out, Event{Kind: EvError, At: at, Text: clipText(why)})
		}
		if l.Usage != nil {
			out = append(out, Event{Kind: EvUsage, At: at, InputTokens: l.Usage.Input, OutputTokens: l.Usage.Output,
				CachedTokens: l.Usage.Cached, Cumulative: true})
		}
		return out
	}
	return nil
}

func (grokAdapter) StreamLabel(line string) string {
	l, ok := parseGrok(line)
	if !ok {
		return ""
	}
	switch l.Kind {
	case "result":
		return "Finishing"
	case "tool":
		if l.State == "start" {
			var input map[string]any
			_ = json.Unmarshal(l.Input, &input)
			return toolLabel(l.Name, input)
		}
	}
	return ""
}

func (grokAdapter) StreamModel(line string) string {
	l, ok := parseGrok(line)
	if !ok || l.Kind != "init" {
		return ""
	}
	m := modelChars.ReplaceAllString(l.Model, "")
	if len(m) > 200 {
		m = m[:200]
	}
	return m
}
