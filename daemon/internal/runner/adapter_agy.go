package runner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

// agyAdapter runs Antigravity CLI in headless print mode under its own terminal sandbox
// (change record agy-seat). Print mode always turns that sandbox on: measured on macOS with agy
// 1.5.16, its commands could not read ~/.gemini, resolve or reach any host, write outside the
// workspace, or find the "gemini" Keychain item, with or without --sandbox. Its file tools are
// not inside that sandbox, so Control Rod passes --settings with read_file and write_file rules
// that deny every path outside the workspace. Those rules match path prefixes and a folder that
// holds the workspace cannot be denied without denying the workspace, so the workspace is always
// placed outside the home folder (agyRunRoot, checkerRoot) and every sibling on the way down to
// it is denied by name (agyOutsideDenies).
type agyAdapter struct{ sandboxedBase }

func (agyAdapter) LoginDir(home string, _ func(string) string) string {
	return filepath.Join(home, ".gemini")
}

func (agyAdapter) LoginWritableFiles() []string { return nil }
func (agyAdapter) LoginSessionDirs() []string   { return []string{"antigravity-cli", "antigravity"} }

// ConfinementGap is empty on macOS, the one platform the sandbox was measured on. Elsewhere the
// runtime stays listed and is never started.
func (agyAdapter) ConfinementGap() string {
	if runtime.GOOS == "darwin" {
		return ""
	}
	return "Antigravity's terminal sandbox has been measured on macOS only; on this platform Control Rod has not checked that its commands cannot read your logins or reach the network."
}

func (agyAdapter) ID() string                  { return RuntimeAgy }
func (agyAdapter) Binary() string              { return "agy" }
func (agyAdapter) DisplayName() string         { return "Antigravity CLI" }
func (agyAdapter) Family() string              { return "Google" }
func (agyAdapter) AuthorLaunchQualified() bool { return runtime.GOOS == "darwin" }
func (agyAdapter) ListOnSubscriptions() bool   { return true }

// AuthStatusArgs is `agy models`: exit 0 with the model list when signed in, exit 1 with "Please
// sign in" when not (measured with agy 1.5.16). It reaches Antigravity's service.
func (agyAdapter) AuthStatusArgs() []string { return []string{"models"} }

func (agyAdapter) ConfirmAuthCommand(func(args ...string) (string, int, error)) bool { return true }

func (agyAdapter) Providers() []string {
	return []string{"agy", "antigravity", "gemini-cli"}
}

func (a agyAdapter) Available(lookPath func(string) (string, error), _ func(string) string) bool {
	return availableBinary(a, lookPath)
}

func (agyAdapter) Capabilities() Capabilities {
	return Capabilities{
		Roles:            []string{"author", "pre-check", "intake"},
		OutputFormat:     "stream-json",
		ToolAllowlist:    true,
		NativeSandbox:    "terminal-sandbox",
		NetworkHostLimit: false,
		MultiVendor:      false,
		ConfigIsolation:  []string{"--settings", "--disable-slash-commands"},
	}
}

func (a agyAdapter) Probe(ctx context.Context, _ string, run CommandRunner) RuntimeStatus {
	return probeInstalled(ctx, a.ID(), a.Binary(), run, func(call func(args ...string) (string, int, error), st *RuntimeStatus) bool {
		out, code, err := call("models")
		st.LoginChecked = err == nil
		if err != nil || code != 0 {
			st.Reason = fmt.Sprintf("agy is installed but not signed in (`agy models` exit %d). Sign in yourself by running `agy` once; Control Rod never does.", code)
			return true
		}
		st.Models = agyModels(out)
		if !agyQualifiedVersion(st.Version) {
			st.Reason = agyVersionReason(st.Version)
			return true
		}
		return false
	})
}

// agyQualifiedVersions are the Antigravity builds whose confinement was qualified live (change
// record agy-seat): the tool names the seat gate refuses and the field a sandbox-bypass request
// carries were measured on these exact builds. Any other build, a patch or
// prerelease of the same series too, is listed but not seated until it is qualified.
var agyQualifiedVersions = []string{"1.5.16"}

// agyVersionRE takes the first x.y.z in the version line with anything that follows it attached
// (a prerelease or build suffix), so "1.5.16-beta" is not read as 1.5.16.
var agyVersionRE = regexp.MustCompile(`(?:^|[^0-9.])(\d+\.\d+\.\d+[^\s,;()]*)`)

func agyQualifiedVersion(v string) bool {
	m := agyVersionRE.FindStringSubmatch(v)
	return m != nil && slices.Contains(agyQualifiedVersions, m[1])
}

func agyVersionReason(v string) string {
	return fmt.Sprintf("Antigravity CLI %q is installed, but Control Rod has qualified its sandbox only on version %s, so it is not seated yet.", v, strings.Join(agyQualifiedVersions, ", "))
}

// agyModels reads model ids from `agy models`: the first field of each line that looks like an
// id. Headings and blank lines are skipped. The list only orders choices; models.json decides
// which ones may check.
func agyModels(out string) []string {
	var ms []string
	for _, line := range strings.Split(out, "\n") {
		f := strings.Fields(strings.TrimLeft(strings.TrimSpace(line), "-*• "))
		if len(f) == 0 || !modelID(f[0]) || slices.Contains(ms, f[0]) {
			continue
		}
		ms = append(ms, f[0])
	}
	return ms
}

func modelID(s string) bool {
	if !strings.Contains(s, "-") || len(s) > 80 {
		return false
	}
	for _, r := range s {
		if !(r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '.' || r == '_') {
			return false
		}
	}
	return true
}

func (agyAdapter) PreflightCLI(ctx context.Context, run CommandRunner) error {
	if out, code, err := run(ctx, agyAdapter{}.Binary(), "--version"); err != nil || code != 0 || !agyQualifiedVersion(firstLine(out)) {
		return refuse("%s", agyVersionReason(firstLine(out)))
	}
	if _, code, err := run(ctx, agyAdapter{}.Binary(), "models"); err != nil || code != 0 {
		return refuse("Antigravity CLI is not signed in. Run `agy` once and sign in; Control Rod never signs in for you.")
	}
	return nil
}

// PrepareRunHome gives the run its own empty home folder beside the workspace, so none of the
// user's Antigravity configuration loads: no MCP servers, plugins, hooks, skills, rules, global
// instructions, permission grants or trusted folders (Antigravity has no switch for these in
// print mode). Only the Keychain is linked in, because the login lives there; the sandbox still
// refuses the Keychain item to commands (measured: `security` exit 44). Conversations and logs
// land in this folder, not in the user's ~/.gemini, and go when the daemon removes it. The
// folder is outside the workspace, so the agent cannot write it, and it is created before the
// file-tool rules are computed, so it is denied to the file tools by name like every other
// entry beside the workspace.
func (agyAdapter) PrepareRunHome(ws *Workspace) error {
	real, err := os.UserHomeDir()
	if err != nil || real == "" {
		return errors.New("the home folder cannot be resolved, so Antigravity's login cannot be found")
	}
	dir, err := canonicalPath(ws.Dir)
	if err != nil {
		return err
	}
	home := dir + ".home"
	if err := os.RemoveAll(home); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Join(home, "Library"), 0o700); err != nil {
		return err
	}
	if err := os.Symlink(filepath.Join(real, "Library", "Keychains"), filepath.Join(home, "Library", "Keychains")); err != nil {
		return err
	}
	if err := writeAgyGate(home); err != nil {
		return err
	}
	ws.RunHome = home
	return nil
}

// agyGatedTools are Antigravity tools that act outside its terminal sandbox and that no
// permission rule or setting turns off in print mode (measured with agy 1.5.16: web search runs
// on Google's side, a subagent runs, and schedule, send_message and run_workflow are offered).
// The others are not offered in print mode today and are listed so a later version that offers
// them is gated too.
var agyGatedTools = []string{
	"search_web", "read_url_content", "invoke_subagent", "define_subagent", "browser_subagent", "manage_subagents",
	"browser_.*", "open_browser_url", "read_browser_page", "list_browser_pages", "capture_browser_.*", "click_browser_pixel",
	"execute_browser_javascript", "call_mcp_tool", "read_resource", "list_resources", "generate_image", "schedule",
	"send_message", "manage_inbox", "run_workflow", "search_marketplace", "list_plugin_accounts",
}

// agyGateReason is what the agent is told when a gated tool is refused.
const agyGateReason = "blocked by Control Rod seat policy: this tool acts outside the sandbox"

// agyBypassReason is what the agent is told when it asks to run a command outside the sandbox.
const agyBypassReason = "blocked by Control Rod seat policy: commands may not leave the sandbox"

// agyBypassGate refuses a terminal call that asks to run outside the sandbox. After a command
// fails in the sandbox, Antigravity offers the agent a retry with BypassSandbox set, and an allow
// rule approves that retry without asking (measured with agy 1.5.16: the retry read the home
// folder and reached the network). No permission rule turns it off ("unsandboxed" rules are
// ignored), so this hook does. Any value of the field other than false is refused, and an input
// it cannot read is refused too; every other call falls through to the permission rules ("ask").
// The key is written by Antigravity, not by the model: inside a JSON string its quotes are
// escaped, so text in the command line cannot match it.
var agyBypassGate = "#!/bin/sh\nin=$(/bin/cat | /usr/bin/tr -d '\\r\\n') || in=\n" +
	"if [ -z \"$in\" ] || printf '%s' \"$in\" | /usr/bin/grep -Eiq '\"bypasssandbox\"[[:space:]]*:[[:space:]]*[^f[:space:]]'; then\n" +
	"  printf '%s\\n' " + shellQuote(encodeJSON(map[string]string{"decision": "deny", "reason": agyBypassReason})) + "\n" +
	"else\n  printf '%s\\n' '{\"decision\":\"ask\"}'\nfi\n"

// writeAgyGate writes the run home's global hooks.json: a PreToolUse hook that refuses every
// gated tool. A hook in the global configuration is Control Rod's own, and a workspace hook that
// allows does not override it (measured). The hook command only prints the refusal.
func writeAgyGate(home string) error {
	cfg := filepath.Join(home, ".gemini", "config")
	if err := os.MkdirAll(cfg, 0o700); err != nil {
		return err
	}
	script := filepath.Join(home, ".controlrod-gate.sh")
	body := "#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' " + shellQuote(encodeJSON(map[string]string{"decision": "deny", "reason": agyGateReason})) + "\n"
	if err := os.WriteFile(script, []byte(body), 0o700); err != nil {
		return err
	}
	bypass := filepath.Join(home, ".controlrod-nobypass.sh")
	if err := os.WriteFile(bypass, []byte(agyBypassGate), 0o700); err != nil {
		return err
	}
	hooks := map[string]any{"controlrod-seat-gate": map[string]any{"PreToolUse": []any{map[string]any{
		"matcher": strings.Join(agyGatedTools, "|"),
		"hooks":   []any{map[string]any{"type": "command", "command": script, "timeout": 10}},
	}, map[string]any{
		"matcher": "run_command",
		"hooks":   []any{map[string]any{"type": "command", "command": bypass, "timeout": 10}},
	}}}}
	return os.WriteFile(filepath.Join(cfg, "hooks.json"), []byte(encodeJSON(hooks)+"\n"), 0o600)
}

func shellQuote(s string) string { return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'" }

// agyToolNote is added to the prompt: Antigravity's print mode refuses any command with a shell
// operator and then ends the run, so the agent is told before it tries.
const agyToolNote = " Run one simple command per terminal call, with no pipes, redirects, &&, || or ; (they are refused and end the run)."

// agyCommandDenies are commands no Antigravity run may start, whatever the role: other agent
// CLIs, the Keychain tool, network clients, pushes, and programs that hand work to the desktop
// session outside the sandbox.
var agyCommandDenies = []string{
	"agy", "antigravity", "claude", "codex", "grok", "opencode", "gemini",
	"security", "osascript", "open", "sudo", "su", "launchctl",
	"curl", "wget", "ssh", "scp", "sftp", "rsync", "nc", "git push", "git remote", "git config", "gh",
}

// agyCheckerCommands are the commands a checker runs without asking. Antigravity's allow list is
// not closed (it keeps a built-in list of commands it treats as safe, and sends others to its own
// reviewers), so the checker also denies the common writing commands by name, has immutable inputs,
// and is voided by any change outside scratch/.
var agyCheckerCommands = []string{
	"ls", "cat", "head", "tail", "grep", "wc", "diff", "stat", "file", "test",
	"git diff", "git log", "git show", "git status",
}

// agyCheckerWriteDenies are commands a checker never runs, because they write or run code.
var agyCheckerWriteDenies = []string{
	"rm", "mv", "cp", "touch", "mkdir", "rmdir", "tee", "sed", "awk", "chmod", "chown", "ln", "dd", "truncate",
	"install", "patch", "git apply", "git checkout", "git reset", "git restore", "git commit", "git add", "git stash",
	"python", "python3", "node", "perl", "ruby", "sh", "bash", "zsh", "env", "xargs", "find",
	"chflags", "xattr", "php", "tclsh", "wish", "lua", "vim", "vi", "nvim", "emacs", "nano", "ed", "ex", "tar", "ditto", "cpio", "pax", "unzip", "swift", "swiftc", "xcrun", "clang", "cc", "gcc", "make",
	"git diff --output", "git log --output", "git show --output",
}

func (a agyAdapter) Command(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error) {
	if p == nil {
		return nil, errors.New("sandbox policy required")
	}
	if ws == nil {
		return nil, errors.New("Antigravity needs a workspace")
	}
	if ws.Checkout == nil {
		if err := a.PrepareRunHome(ws); err != nil {
			return nil, fmt.Errorf("prepare Antigravity's run home: %w", err)
		}
	}
	args, err := AgyArgs(run, ws, p, at)
	if err != nil {
		return nil, err
	}
	if ws.Checker && ws.RunRoot != "" {
		// Antigravity's terminal sandbox lets commands write anywhere in the workspace, so a
		// checker's inputs are made immutable: a command cannot change them, even for a moment and
		// put them back before the tree is hashed again. The flag is cleared when the run folder
		// is removed.
		if err := setImmutable(ws.Inputs, true); err != nil {
			return nil, fmt.Errorf("make the checker's inputs read-only: %w", err)
		}
	}
	return exec.Command(a.Binary(), args...), nil
}

// AgyArgs is the print-mode argument list for a run (change record agy-seat). The settings are
// passed inline, never as a file, so nothing an agent can write configures the run.
func AgyArgs(run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) ([]string, error) {
	if p == nil {
		return nil, errors.New("sandbox policy required")
	}
	if ws == nil {
		return nil, errors.New("Antigravity needs a workspace")
	}
	if ws.Checkout != nil {
		return nil, refuse("Antigravity cannot work in a repository checkout yet: its file tools can only be fenced off for a workspace outside the home folder. It can check work and do tasks that need no checkout.")
	}
	if len(p.AllowedHosts) > 0 || NeedsNetwork(ws) {
		return nil, refuse("Antigravity's sandbox gives its commands no network, so it cannot run a role that needs network.")
	}
	for _, t := range []string{"command", "read", "edit", "write", "search"} {
		if !slices.Contains(p.EnabledTools, t) {
			return nil, fmt.Errorf("Antigravity cannot run without its %s tool, so it cannot run under this policy", t)
		}
	}
	// Antigravity loads .agents/ (and its spellings), GEMINI.md and AGENTS.md from the workspace and
	// every folder above it, and runs their hooks outside its sandbox when it starts. Hooks are read
	// once, at start, so a file the agent writes during a run cannot run in that run (measured); one
	// planted beside a later workspace is found here and refuses that run.
	if hits, err := upwardInstructionHits(ws.Dir); err != nil {
		return nil, err
	} else if len(hits) > 0 {
		return nil, refuse("Antigravity would load configuration from %s, and its hooks run outside the sandbox. Remove it to run Antigravity.", strings.Join(hits, ", "))
	}
	settings, err := AgySettings(ws, p, at)
	if err != nil {
		return nil, err
	}
	prompt := Prompt
	if ws.Checker {
		prompt = CheckerPrompt
	}
	// A checker runs in Antigravity's default mode. Plan mode in print mode only plans: the run
	// ends after the plan, asking for approval, so the verdict is never written (measured with agy
	// 1.5.16, also with artifactReviewPolicy always-proceed). A checker is held instead by the deny
	// rules, the scratch-only file writes, immutable inputs and the before-and-after tree hash.
	args := []string{"-p", prompt + agyToolNote, "--output-format", "stream-json", "--sandbox",
		"--settings", settings, "--disable-slash-commands"}
	if m := RequestedModel(run); m != "" {
		args = append(args, "--model", m)
	}
	return args, nil
}

// AgySettings is the --settings value: what the file tools may write, what they may not read, and
// which commands may run without asking. Rules are checked deny first, so a deny never covers the
// workspace itself; the workspace must be outside every folder the policy denies.
func AgySettings(ws *Workspace, p *SandboxPolicy, at SandboxPaths) (string, error) {
	dir, err := canonicalPath(ws.Dir)
	if err != nil {
		return "", fmt.Errorf("the workspace cannot be resolved (%v), so Antigravity's file tools cannot be fenced", err)
	}
	denied, err := p.DeniedChecked(at)
	if err != nil {
		return "", err
	}
	outside, err := agyOutsideDenies(dir)
	if err != nil {
		return "", err
	}
	var reads []string
	for _, d := range append(denied, outside...) {
		if within(dir, d) {
			return "", refuse("the workspace %s is inside %s, which this run may not read, so Antigravity's file tools cannot be fenced. Antigravity runs only in a workspace outside the home folder.", dir, d)
		}
		if within(d, dir) {
			continue
		}
		reads = append(reads, d)
	}
	sort.Strings(reads)
	reads = slices.Compact(reads)

	var allow, deny []string
	for _, d := range reads {
		deny = append(deny, "read_file("+d+")")
	}
	inputs := filepath.Join(dir, "inputs")
	deny = append(deny, "write_file("+inputs+")")
	for _, c := range agyCommandDenies {
		deny = append(deny, "command("+c+")")
	}
	if ws.Checker {
		for _, c := range agyCheckerWriteDenies {
			deny = append(deny, "command("+c+")")
		}
		allow = append(allow, "write_file("+filepath.Join(dir, "scratch")+")")
		deny = append(deny, "write_file("+filepath.Join(dir, "out")+")")
		for _, c := range agyCheckerCommands {
			allow = append(allow, "command("+c+")")
		}
	} else {
		allow = append(allow, "write_file("+dir+")", agyAnyCommand)
	}
	return encodeJSON(map[string]any{
		"permissions": map[string]any{"allow": allow, "deny": deny},
	}), nil
}

// agyAnyCommand is the rule that lets an author run any command not denied. Commands still run
// inside Antigravity's terminal sandbox.
const agyAnyCommand = "command(*)"

// agyOutsideDenies names every existing entry beside the path from "/" down to dir, so a file tool
// rule can deny everything outside dir without denying a folder that holds it. An entry created
// later in one of those folders is not named; only the per-user temporary folders on that path
// are writable by the user, and the file tools can only create new files there, not change
// existing ones.
// agySystemPaths are left readable to the file tools. Antigravity compiles the file-tool read
// denies into its terminal sandbox too, so denying these stops every command from starting
// (measured with agy 1.5.16: zsh fails with exit 71, and the agent then asks to run outside the
// sandbox). They hold the operating system and installed programs, not the user's files: the
// home folders, other volumes, the per-user temporary folders and every other run stay denied.
// Anything not on this list is denied, so a new top-level folder is denied by default.
var agySystemPaths = []string{
	"/Applications", "/Library", "/System", "/bin", "/dev", "/etc", "/opt", "/sbin", "/tmp", "/usr", "/var",
	"/private/etc", "/private/tmp", "/private/var/db", "/private/var/run", "/private/var/select",
}

func agyOutsideDenies(dir string) ([]string, error) {
	if !filepath.IsAbs(dir) {
		return nil, fmt.Errorf("workspace %s is not absolute", dir)
	}
	var out []string
	cur := string(filepath.Separator)
	rel := strings.TrimPrefix(filepath.Clean(dir), cur)
	if rel == "" {
		return nil, errors.New("the workspace cannot be the root folder")
	}
	for _, part := range strings.Split(rel, string(filepath.Separator)) {
		entries, err := os.ReadDir(cur)
		if err != nil {
			return nil, fmt.Errorf("cannot list %s (%v), so Antigravity's file tools cannot be fenced", cur, err)
		}
		for _, e := range entries {
			if p := filepath.Join(cur, e.Name()); e.Name() != part && !slices.Contains(agySystemPaths, p) {
				out = append(out, p)
			}
		}
		cur = filepath.Join(cur, part)
	}
	return out, nil
}

// WorkspaceRoot puts each Antigravity author or intake run in a fresh owner-only folder directly
// in /var/tmp, outside the home folder and the daemon's home, for the reason on agyAdapter. The
// folder holds only this run's workspace and run home. The file tools can create a new file in a
// folder above the workspace that is not denied (measured with agy 1.5.16), so no folder shared
// between runs sits on the path: such a file lands in this run's own folder or in /var/tmp, and
// every other run's folder is beside it and denied by name. A later run whose path would load
// instruction files planted that way is refused.
func (agyAdapter) WorkspaceRoot(string) (string, error) { return agyRunRoot() }

// SerializeRuns: Antigravity's file-tool fence names the folders beside the workspace when the
// run starts, so a folder another run makes later would not be denied. Runs of this runtime on
// this machine therefore never overlap: the lock is held from before the run folder is made until
// it is removed, across every daemon of this user.
func (agyAdapter) SerializeRuns(ctx context.Context) (func(), error) {
	tmp, err := canonicalPath("/var/tmp")
	if err != nil {
		return nil, err
	}
	return lockFileWait(ctx, filepath.Join(tmp, fmt.Sprintf("controlrod-agy-%d.lock", os.Getuid())))
}

func agyRunRoot() (string, error) {
	tmp, err := canonicalPath("/var/tmp")
	if err != nil {
		return "", err
	}
	// The shared checker folder of the other runtimes exists before the fence is computed, so it is
	// denied by name even when no check has run yet.
	if _, err := checkerRoot(""); err != nil {
		return "", err
	}
	hits, err := upwardInstructionHits(tmp)
	if err != nil {
		return "", err
	}
	if len(hits) > 0 {
		return "", fmt.Errorf("the Antigravity workspace would discover instruction files (%s)", strings.Join(hits, ", "))
	}
	dir, err := os.MkdirTemp(tmp, fmt.Sprintf("controlrod-agy-%d-", os.Getuid()))
	if err != nil {
		return "", err
	}
	if st, err := os.Lstat(dir); err != nil || !st.IsDir() || !ownedByMe(st) || st.Mode().Perm() != 0o700 {
		os.RemoveAll(dir)
		return "", fmt.Errorf("%s is not a private folder of this user, so no Antigravity workspace is made there", dir)
	}
	return dir, nil
}

// SelfConfinedChecker: an Antigravity checker is not wrapped in Control Rod's outer Seatbelt
// profile. Antigravity's sandbox cannot start inside another one (measured: every command then
// fails with "sandbox_apply: Operation not permitted"), so the checker relies on the settings
// above instead: scratch is the only folder the file tools may write, inputs/ is denied, and
// only reading commands run. The deliverable tree is still hashed before and after, so any
// change to it voids the check.
func (agyAdapter) SelfConfinedChecker() bool { return true }

// ExitStatusUntrusted: Antigravity exits 0 when it stops a run at a refused tool, so the daemon
// decides from its result line (status SUCCESS with no finish reason), and a run without one fails.
func (agyAdapter) ExitStatusUntrusted() bool { return true }

func (agyAdapter) LaunchInfo(run Run, ws *Workspace, p *SandboxPolicy) Launch {
	l := baseLaunch(run)
	l.Sandbox = sandboxLabel(p)
	if ws != nil && ws.Checker {
		l.AllowedTools = slices.Clone(agyCheckerCommands)
	}
	return l
}

// Antigravity's stream-json is its own shape: {"event": "init" | "step_update" | "result", ...}.

type agyLine struct {
	Event string `json:"event"`
	Init  *struct {
		Model string `json:"model"`
	} `json:"init"`
	Step *struct {
		Index    int    `json:"step_index"`
		State    string `json:"state"`
		Type     string `json:"step_type"`
		Text     string `json:"text_delta"`
		ToolName string `json:"tool_name"`
		ToolInfo *struct {
			Name   string          `json:"name"`
			Params json.RawMessage `json:"parameters"`
			Error  *struct {
				Message string `json:"message"`
			} `json:"error"`
		} `json:"tool_info"`
	} `json:"step_update"`
	Result *agyResult `json:"result"`
}

type agyResult struct {
	Status         string `json:"status"`
	Response       string `json:"response"`
	Error          string `json:"error"`
	FinishedReason string `json:"finished_reason"`
	Usage          *struct {
		Input  *int `json:"input_tokens"`
		Output *int `json:"output_tokens"`
		Cached *int `json:"cache_read_tokens"`
	} `json:"usage"`
}

func parseAgy(line string) (agyLine, bool) {
	var l agyLine
	t := strings.TrimSpace(line)
	if !strings.HasPrefix(t, "{") || json.Unmarshal([]byte(t), &l) != nil || l.Event == "" {
		return agyLine{}, false
	}
	return l, true
}

// failed is true when the run did not finish its work: an error status, or any finish reason,
// which Antigravity sets only for a timeout, an interruption or an error. Antigravity exits 0 when
// it stops on a refused tool, so the result is read, not the exit code.
func (r *agyResult) failed() bool {
	return r == nil || r.Status != "SUCCESS" || r.FinishedReason != ""
}

func (agyAdapter) TurnEnd(line string) (bool, bool) {
	l, ok := parseAgy(line)
	if !ok || l.Event != "result" {
		return false, false
	}
	return true, l.Result.failed()
}

func (agyAdapter) Normalize(line string, now time.Time) []Event {
	l, ok := parseAgy(line)
	if !ok {
		return nil
	}
	at := now.UTC().Format(time.RFC3339Nano)
	switch l.Event {
	case "step_update":
		s := l.Step
		if s == nil || s.Type != "tool" {
			return nil
		}
		name := s.ToolName
		var input map[string]any
		var params json.RawMessage
		if s.ToolInfo != nil {
			if name == "" {
				name = s.ToolInfo.Name
			}
			params = s.ToolInfo.Params
			_ = json.Unmarshal(params, &input)
		}
		id := fmt.Sprintf("step-%d", s.Index)
		switch s.State {
		case "ACTIVE":
			return []Event{{Kind: EvToolStart, At: at, Tool: token(name, 60), Summary: toolLabel(name, input),
				InputDigest: digestOf(input), CallID: id}}
		case "DONE":
			return []Event{{Kind: EvToolEnd, At: at, Tool: token(name, 60), CallID: id, OK: yes(true)}}
		case "ERROR":
			e := Event{Kind: EvToolEnd, At: at, Tool: token(name, 60), CallID: id, OK: yes(false)}
			if s.ToolInfo != nil && s.ToolInfo.Error != nil {
				e.Text = clipText(s.ToolInfo.Error.Message)
			}
			return []Event{e}
		}
	case "result":
		r := l.Result
		var out []Event
		if r != nil && r.Response != "" {
			out = append(out, Event{Kind: EvMessage, At: at, Text: clipText(r.Response)})
		}
		if r.failed() {
			why := "Antigravity stopped before finishing"
			if r != nil {
				why = strings.TrimSpace(strings.Join([]string{r.Error, r.FinishedReason}, " "))
				if why == "" {
					why = "Antigravity reported " + r.Status
				}
			}
			out = append(out, Event{Kind: EvError, At: at, Text: clipText(why)})
		}
		if r != nil && r.Usage != nil {
			out = append(out, Event{Kind: EvUsage, At: at, InputTokens: r.Usage.Input, OutputTokens: r.Usage.Output,
				CachedTokens: r.Usage.Cached, Cumulative: true})
		}
		return out
	}
	return nil
}

func (agyAdapter) StreamLabel(line string) string {
	l, ok := parseAgy(line)
	if !ok {
		return ""
	}
	switch l.Event {
	case "result":
		return "Finishing"
	case "step_update":
		if l.Step != nil && l.Step.Type == "tool" && l.Step.State == "ACTIVE" {
			var input map[string]any
			name := l.Step.ToolName
			if l.Step.ToolInfo != nil {
				_ = json.Unmarshal(l.Step.ToolInfo.Params, &input)
				if name == "" {
					name = l.Step.ToolInfo.Name
				}
			}
			return toolLabel(name, input)
		}
	}
	return ""
}

func (agyAdapter) StreamModel(line string) string {
	l, ok := parseAgy(line)
	if !ok || l.Event != "init" || l.Init == nil {
		return ""
	}
	m := modelChars.ReplaceAllString(l.Init.Model, "")
	if len(m) > 200 {
		m = m[:200]
	}
	return m
}
