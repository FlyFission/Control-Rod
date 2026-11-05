package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strings"

	"github.com/BurntSushi/toml"
	"github.com/flyfission/control-rod/daemon/internal/digest"
)

// SandboxPolicy is what a run's agent actions may touch (workbench specification 23; ADR 0021;
// plan task 6.1). The control plane resolves one per run and binds it to the run by digest; the
// daemon derives every CLI setting from it and from nothing else.
type SandboxPolicy struct {
	ID              string   `json:"id"`
	Version         int      `json:"version"`
	OrgID           string   `json:"org_id"`
	Driver          string   `json:"driver"`
	DeniedRead      []string `json:"denied_read"`
	WritableRoots   []string `json:"writable_roots"`
	AllowedHosts    []string `json:"allowed_hosts"`
	EnabledTools    []string `json:"enabled_tools"`
	MandatoryClaims []string `json:"mandatory_claims"`
}

// PolicyRef is how a run cites the policy version it runs under.
type PolicyRef struct {
	ID      string `json:"id"`
	Version int    `json:"version"`
	Digest  Digest `json:"digest"`
}

// DriverNativeCLI is each CLI's own sandbox with settings Control Rod passes (ADR 0021).
const DriverNativeCLI = "native-cli"

// ErrNoPolicy refuses an agent CLI launch that has no verified sandbox policy. There is no
// unsandboxed fallback.
var ErrNoPolicy = errors.New("the job carries no sandbox policy, so no agent CLI is started; update the control plane")

// VerifyPolicy checks the job's policy against the digest the control plane sent and the one it
// recorded on the run, and returns it. Any mismatch refuses the launch: the policy that reached
// the daemon must be exactly the one the run cites.
func VerifyPolicy(job Job) (*SandboxPolicy, error) {
	if len(job.SandboxPolicyRaw) == 0 || job.SandboxPolicyDigest == nil || job.Run.SandboxPolicy == nil {
		return nil, ErrNoPolicy
	}
	sum, err := digest.CanonicalSHA256(job.SandboxPolicyRaw)
	if err != nil {
		return nil, fmt.Errorf("the job's sandbox policy is not canonical JSON: %w", err)
	}
	if sum != job.SandboxPolicyDigest.Value || sum != job.Run.SandboxPolicy.Digest.Value {
		return nil, fmt.Errorf("the job's sandbox policy does not match the digest the run records (%s)", short(job.Run.SandboxPolicy.Digest.Value))
	}
	var p SandboxPolicy
	if err := json.Unmarshal(job.SandboxPolicyRaw, &p); err != nil {
		return nil, fmt.Errorf("read sandbox policy: %w", err)
	}
	if p.ID != job.Run.SandboxPolicy.ID || p.Version != job.Run.SandboxPolicy.Version {
		return nil, fmt.Errorf("the job's sandbox policy is %s v%d, but the run cites %s v%d", p.ID, p.Version, job.Run.SandboxPolicy.ID, job.Run.SandboxPolicy.Version)
	}
	if p.Driver != DriverNativeCLI {
		return nil, fmt.Errorf("sandbox driver %q is not available on this daemon", p.Driver)
	}
	if len(p.DeniedRead) == 0 {
		return nil, errors.New("the sandbox policy denies no reads, which no policy may do")
	}
	// The launch enforces exactly the workspace as the only writable root; anything else is refused
	// rather than carried out differently.
	if !slices.Equal(p.WritableRoots, []string{"workspace"}) {
		return nil, fmt.Errorf("sandbox policy writable roots %q are not supported by this daemon; only the workspace is", p.WritableRoots)
	}
	for _, t := range p.EnabledTools {
		if _, ok := claudeTools[t]; !ok {
			return nil, fmt.Errorf("sandbox policy tool %q is not one this daemon knows", t)
		}
	}
	return &p, nil
}

// SandboxPaths are the concrete paths a policy's denials name on this host.
type SandboxPaths struct {
	Home       string
	DaemonHome string
	Workspace  string
	// Logins are where the CLIs keep their logins when moved out of the home folder
	// (CODEX_HOME, CLAUDE_CONFIG_DIR), resolved; each is denied like the home folder's own.
	Logins []string
}

// Denied expands the policy's denied reads for this host: `~` is the home folder, and the
// daemon's own home is always added (its token, outbox, receipts and other runs' workspaces). A
// path that does not exist is kept: a denial must hold for a file created during the run.
func (p *SandboxPolicy) Denied(at SandboxPaths) []string {
	seen := map[string]bool{}
	var out []string
	add := func(x string) {
		x = filepath.Clean(x)
		if !seen[x] {
			seen[x] = true
			out = append(out, x)
		}
	}
	for _, d := range p.DeniedRead {
		switch {
		case d == "~":
			add(at.Home)
		case strings.HasPrefix(d, "~/"):
			add(filepath.Join(at.Home, d[2:]))
		case filepath.IsAbs(d):
			add(d)
		}
	}
	if at.DaemonHome != "" {
		add(at.DaemonHome)
	}
	for _, l := range at.Logins {
		add(l)
	}
	return out
}

// LoginLocations are where the CLIs keep their logins, wherever they really are: the folders the
// environment names (CODEX_HOME, CLAUDE_CONFIG_DIR) and the default folders and login files in the
// home folder, each resolved through links (ADR 0021's denied read set). A login inside the home
// folder is covered by the home denial; one a link points outside it is denied by its real path.
func LoginLocations(getenv func(string) string, home string) []string {
	cands := []string{
		filepath.Join(home, ".claude"), filepath.Join(home, ".codex"), filepath.Join(home, ".claude.json"),
		filepath.Join(home, ".claude", ".credentials.json"), filepath.Join(home, ".codex", "auth.json"),
	}
	for _, k := range []string{"CODEX_HOME", "CLAUDE_CONFIG_DIR"} {
		if v := getenv(k); v != "" {
			cands = append(cands, v, filepath.Join(v, "auth.json"), filepath.Join(v, ".credentials.json"))
		}
	}
	var out []string
	for _, c := range cands {
		abs, err := filepath.Abs(c)
		if err != nil {
			continue
		}
		real, err := filepath.EvalSymlinks(abs)
		if err != nil {
			continue // absent: nothing to read
		}
		for _, p := range []string{abs, real} {
			if !slices.Contains(out, p) {
				out = append(out, p)
			}
		}
	}
	return out
}

// ErrLoginInWorkspace refuses a layout where a CLI login lies inside the run's workspace, which no
// sandbox here can keep from the agent.
var ErrLoginInWorkspace = errors.New("a CLI login is inside the run's workspace; move the workspace (CONTROLROD_HOME) or the login")

// outermost keeps only denials no other denial contains, and only those that exist: Codex's
// bubblewrap cannot mount a denial inside a denied folder (measured in evidence/phase6), a nested
// denial adds nothing to its parent's, and a path that does not exist can only appear by a write,
// which the profile confines to the workspace. A denied folder that holds the workspace (the home
// folder, the daemon's home) is denied whole: Codex's :workspace keeps the workspace itself usable,
// and anything created in that folder later is covered too.
func outermost(paths []string) []string {
	var out []string
	for _, p := range paths {
		if p == "" || slices.Contains(out, p) {
			continue
		}
		if _, err := os.Lstat(p); err != nil {
			continue
		}
		nested := false
		for _, q := range paths {
			if q != p && within(p, q) {
				nested = true
				break
			}
		}
		if !nested {
			out = append(out, p)
		}
	}
	return out
}

// within reports whether path is dir or inside it.
func within(path, dir string) bool {
	rel, err := filepath.Rel(dir, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, "../")
}

// Claude Code tools for each tool the policy enables (ADR 0021's allowlist).
var claudeTools = map[string][]string{
	"command": {"Bash"},
	"read":    {"Read"},
	"edit":    {"Edit"},
	"write":   {"Write"},
	"search":  {"Grep", "Glob"},
}

// ClaudeToolList is the --tools value: only built-in tools the policy enables.
func ClaudeToolList(p *SandboxPolicy) string {
	var out []string
	for _, t := range p.EnabledTools {
		out = append(out, claudeTools[t]...)
	}
	return strings.Join(out, ",")
}

// ClaudeSettings is the --settings value for a run (ADR 0021): the command sandbox on, failing
// closed, with no unsandboxed retry; reads outside the workspace blocked for commands and file
// tools alike; the denied paths named again as rules; network only to the policy's hosts; and,
// when set, the PermissionRequest hook that records refusals (plan task 2.9).
//
// Claude Code refuses writes inside a denied folder, so a denial that contains the workspace (the
// home folder, the daemon's home) is left to blockReadsOutsideWorkingDirectories, which covers
// it without closing the workspace (measured in evidence/phase6).
func ClaudeSettings(p *SandboxPolicy, at SandboxPaths, hookFile string) string {
	var deny, rules []string
	for _, d := range p.Denied(at) {
		if within(at.Workspace, d) {
			continue
		}
		deny = append(deny, d)
		rules = append(rules, "Read(/"+d+")", "Read(/"+d+"/**)", "Edit(/"+d+")", "Edit(/"+d+"/**)")
	}
	hosts := append([]string{}, p.AllowedHosts...)
	settings := map[string]any{
		"sandbox": map[string]any{
			"enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false,
			// Bash runs only as the role's allowlist permits, and then always sandboxed.
			"autoAllowBashIfSandboxed": false,
			"filesystem":               map[string]any{"denyRead": nonNil(deny)},
			"network":                  map[string]any{"allowedDomains": nonNil(hosts)},
		},
		"permissions": map[string]any{
			"defaultMode":                         ClaudePermissionMode,
			"blockReadsOutsideWorkingDirectories": true,
			"deny":                                nonNil(rules),
		},
	}
	if hookFile != "" {
		settings["hooks"] = permissionHook(hookFile)
	}
	return encodeJSON(settings)
}

func nonNil(xs []string) []string {
	if xs == nil {
		return []string{}
	}
	return xs
}

func encodeJSON(v any) string {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	_ = enc.Encode(v)
	return strings.TrimSpace(buf.String())
}

// ClaudeIsolationArgs keep everything the run did not declare out of a Claude Code launch: no MCP
// server, no user, project or local settings (and so no user hooks, plugins or memory files), no
// skills or slash commands, and nothing persisted (measured in evidence/phase6 with a positive
// control that leaks each of them without these arguments). --restricted confines the file tools
// to the working directory by rule and refuses bypassing permissions; it removes command tools
// unless --tools names them, and the policy's --tools does.
func ClaudeIsolationArgs() []string {
	return []string{"--restricted", "--strict-mcp-config", "--mcp-config", `{"mcpServers":{}}`, "--setting-sources", "",
		"--disable-slash-commands", "--no-session-persistence"}
}

// CodexDisabledFeatures are Codex features that would give an agent a way to act outside the
// command sandbox, or bring in configuration the run did not declare. Each is switched off on
// every run; CodexSafeFeatures lists what may stay on, and a pinned version that enables anything
// else is refused by the preflight until it is qualified.
var CodexDisabledFeatures = []string{
	"apps", "browser_use", "browser_use_external", "browser_use_full_cdp_access",
	"computer_use", "daemon_auto_start", "goals", "guardian_approval", "hooks", "image_generation",
	"in_app_browser", "in_app_local_automation", "memories", "multi_agent", "plugin_discovery_prefetch",
	"plugin_sharing", "plugins", "remote_plugin", "shell_snapshot", "skill_mcp_dependency_install",
	"skill_search", "tool_call_mcp_elicitation", "tool_suggest", "view_image", "workspace_dependencies",
}

// CodexSafeFeatures may stay enabled: they change how Codex talks to its own provider or renders
// output, not what an agent action can reach.
var CodexSafeFeatures = []string{
	"api_key_cyber_access_programs", "api_key_model_discovery", "auth_elicitation", "bedrock_setup_wizard",
	"browser_annotation_api", "cli_daybreak", "code_mode_host", "code_mode_interrupt", "compaction_image_budget",
	"content_item_kinds", "enable_request_compression", "fast_mode", "guardian_reuse_parent_compaction",
	"in_app_chat", "in_app_dictation", "in_app_updates", "in_app_voice", "incremental_tools",
	"instant_interrupt", "mcp_oauth_refresh_coordination", "mentions_v2", "prediction_preserve_parent_tools",
	"reasoning_effort_override", "shell_tool", "sleep_tool", "system_proxy_fallback", "ultrafast_mode",
	"unbounded_connection_retries", "unified_exec", "unified_exec_tty", "write_stdin_approval",
}

// CodexPolicyArgs is Codex's permission profile for a run, passed as overrides so the user's
// config.toml is never written (ADR 0021): agent actions are confined to the workspace, read none
// of the denied paths (a denied folder that contains the workspace still leaves the workspace
// usable for Codex; measured in evidence/phase6), have no network, inherit only the core
// environment, and never ask to run unsandboxed. sandbox_mode is never set, because Codex ignores
// a permission profile whenever it is.
func CodexPolicyArgs(p *SandboxPolicy, at SandboxPaths) ([]string, error) {
	if len(p.AllowedHosts) > 0 {
		return nil, errors.New("Codex cannot limit an agent's network to named hosts, so it cannot run under this policy")
	}
	// Codex's shell and patch tools cannot be switched off one by one, so it runs only under a
	// policy that enables them all.
	for _, t := range []string{"command", "read", "edit", "write", "search"} {
		if !slices.Contains(p.EnabledTools, t) {
			return nil, fmt.Errorf("Codex cannot run without its %s tool, so it cannot run under this policy", t)
		}
	}
	fs := map[string]string{":slash_tmp": "read", ":tmpdir": "read"}
	for _, d := range outermost(p.Denied(at)) {
		fs[d] = "deny"
	}
	keys := make([]string, 0, len(fs))
	for k := range fs {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var inline []string
	for _, k := range keys {
		inline = append(inline, fmt.Sprintf("%s=%q", tomlString(k), fs[k]))
	}
	args := []string{
		"--ignore-user-config", "--ignore-rules", "--ephemeral",
		"-c", `default_permissions="control-rod"`,
		"-c", `permissions.control-rod.extends=":workspace"`,
		"-c", "permissions.control-rod.filesystem={" + strings.Join(inline, ",") + "}",
		"-c", "permissions.control-rod.network.enabled=false",
		"-c", `approval_policy="never"`,
		// Hosted web search is a provider-side tool outside the command sandbox (ADR 0021: off).
		"-c", `web_search="disabled"`,
		"-c", `shell_environment_policy.inherit="core"`,
	}
	for _, f := range CodexDisabledFeatures {
		args = append(args, "--disable", f)
	}
	return args, nil
}

// tomlString quotes a key as a TOML basic string.
func tomlString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// agentEnvKeys are the only environment variables an agent CLI (and so every action it runs)
// receives: no provider, cloud or proxy credentials, and no sockets (ADR 0021's environment
// condition). The CLI finds its own login in its own folder.
var agentEnvKeys = map[string]bool{
	"HOME": true, "USER": true, "LOGNAME": true, "SHELL": true, "PATH": true, "LANG": true, "LANGUAGE": true,
	"TZ": true, "TERM": true, "TMPDIR": true, "CODEX_HOME": true, "CLAUDE_CONFIG_DIR": true, "NO_COLOR": true,
	"COLORTERM": true,
}

// AgentEnv is the allowlisted environment for an agent CLI. PATH loses entries on WSL's Windows
// drives, so no Windows program is found by name from inside a run.
func AgentEnv(environ []string) []string {
	out := []string{}
	for _, kv := range environ {
		k, v, ok := strings.Cut(kv, "=")
		if !ok || (!agentEnvKeys[k] && !strings.HasPrefix(k, "LC_")) {
			continue
		}
		if k == "PATH" {
			v = withoutWindowsDrives(v)
		}
		out = append(out, k+"="+v)
	}
	return out
}

func withoutWindowsDrives(path string) string {
	var keep []string
	for _, p := range filepath.SplitList(path) {
		if p == "/mnt" || strings.HasPrefix(p, "/mnt/") {
			continue
		}
		keep = append(keep, p)
	}
	return strings.Join(keep, string(os.PathListSeparator))
}

// HostNeeds are the programs each CLI's sandbox needs on this platform (ADR 0021 preflight): on
// Linux and WSL2, bubblewrap for both, and socat for Claude Code's network proxy. macOS uses each
// CLI's built-in Seatbelt profile and needs nothing extra.
func HostNeeds(rt string) []HostNeed {
	if runtime.GOOS != "linux" {
		return nil
	}
	needs := []HostNeed{{Program: "bwrap", Fix: "Install bubblewrap (on Ubuntu: `sudo apt install bubblewrap`)"}}
	if rt == RuntimeClaude {
		needs = append(needs, HostNeed{Program: "socat", Fix: "Install socat (on Ubuntu: `sudo apt install socat`)"})
	}
	return needs
}

// HostNeed is one program a sandbox needs, with the fix when it is missing.
type HostNeed struct {
	Program string
	Fix     string
}

// PreflightError refuses a run before anything starts, with one plain sentence and the fix (ADR
// 0021 preflight; plan task 6.3). It never leads to an unsandboxed run.
type PreflightError struct{ Reason string }

func (e *PreflightError) Error() string { return e.Reason }

func refuse(format string, a ...any) error { return &PreflightError{Reason: fmt.Sprintf(format, a...)} }

// Preflight checks that this host can run rt under its sandbox (PreflightHost), and then, by
// running the CLI, that it is signed in and, for Codex, that every feature the installed version
// leaves on is one Control Rod has qualified. It runs with the scheduled probe, which already runs
// the CLI to read its version; before each launch only PreflightHost runs, so nothing executes a
// CLI that has not yet been checked against its pin.
func Preflight(ctx context.Context, rt string, run CommandRunner, lookPath func(string) (string, error),
	codexFeatures func(context.Context) (string, error), managedCodexConfig []string) error {
	if err := PreflightHost(rt, lookPath, managedCodexConfig); err != nil {
		return err
	}
	switch rt {
	case RuntimeClaude:
		if _, code, err := run(ctx, "claude", "auth", "status"); err != nil || code != 0 {
			return refuse("Claude Code is not signed in. Run `claude login`; Control Rod never signs in for you.")
		}
	case RuntimeCodex:
		if _, code, err := run(ctx, "codex", "login", "status"); err != nil || code != 0 {
			return refuse("Codex is not signed in. Run `codex login`; Control Rod never signs in for you.")
		}
		list, err := codexFeatures(ctx)
		if err != nil {
			return refuse("Codex did not list its features (%v), so Control Rod cannot tell what an agent could reach. Reinstall the pinned Codex.", err)
		}
		if extra := unqualifiedCodexFeatures(list); len(extra) > 0 {
			return refuse("This Codex version turns on %s, which Control Rod has not qualified. Pin a qualified Codex version.", strings.Join(extra, ", "))
		}
	}
	return nil
}

// PreflightHost checks what the sandbox needs without running the CLI: the programs it needs are on
// the agent's PATH, and for Codex no managed configuration sets sandbox_mode.
func PreflightHost(rt string, lookPath func(string) (string, error), managedCodexConfig []string) error {
	if rt == RuntimeFake {
		return nil
	}
	for _, need := range HostNeeds(rt) {
		if _, err := lookPath(need.Program); err != nil {
			return refuse("%s's sandbox needs %s, which is not installed here. %s.", cliName(rt), need.Program, need.Fix)
		}
	}
	if rt == RuntimeCodex {
		for _, f := range managedCodexConfig {
			key, err := managedWidening(f)
			if err != nil {
				return refuse("%s cannot be read as TOML (%v), so Control Rod cannot tell whether it loosens the sandbox. Fix or remove it.", f, err)
			}
			if key != "" {
				return refuse("%s sets %s, which can loosen the sandbox of every Codex run and which a run cannot override. Remove it.", f, key)
			}
		}
	}
	return nil
}

func cliName(rt string) string {
	if rt == RuntimeClaude {
		return "Claude Code"
	}
	return "Codex"
}

// ManagedCodexConfig lists where an administrator's Codex configuration can set sandbox_mode outside
// the user's own config.toml, which every run ignores: every TOML file in /etc/codex.
func ManagedCodexConfig() []string {
	files, _ := filepath.Glob("/etc/codex/*.toml")
	return append([]string{"/etc/codex/managed_config.toml", "/etc/codex/config.toml", "/etc/codex/requirements.toml"}, files...)
}

// widening are the Codex configuration keys that can loosen what an agent action reaches when set in
// a managed file, which a run cannot ignore: the sandbox mode (which makes Codex drop the permission
// profile), permissions, approvals, web search, features, tools, MCP servers, the command
// environment, and profiles that can carry any of them.
var widening = map[string]bool{
	"sandbox_mode": true, "sandbox_workspace_write": true, "default_permissions": true, "permissions": true,
	"approval_policy": true, "web_search": true, "tools": true, "features": true, "mcp_servers": true,
	"shell_environment_policy": true, "profiles": true, "profile": true,
}

// managedWidening parses a managed Codex file as TOML and returns the first key, at any depth, that
// could loosen the run's sandbox (keys as TOML decodes them, so no quoting or escaping slips past),
// "" when there is none, or an error when the file exists but cannot be read or parsed.
func managedWidening(path string) (string, error) {
	b, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	var doc map[string]any
	if _, err := toml.Decode(string(b), &doc); err != nil {
		return "", err
	}
	var find func(m map[string]any, at string) string
	find = func(m map[string]any, at string) string {
		keys := make([]string, 0, len(m))
		for k := range m {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			if widening[k] {
				return at + k
			}
			switch v := m[k].(type) {
			case map[string]any:
				if f := find(v, at+k+"."); f != "" {
					return f
				}
			case []map[string]any:
				for _, t := range v {
					if f := find(t, at+k+"."); f != "" {
						return f
					}
				}
			}
		}
		return ""
	}
	return find(doc, ""), nil
}

// unqualifiedCodexFeatures reads `codex features list` output (name, stage, effective state) and
// returns every feature left on that is neither qualified as safe nor switched off by Control Rod.
func unqualifiedCodexFeatures(list string) []string {
	safe := map[string]bool{}
	for _, f := range CodexSafeFeatures {
		safe[f] = true
	}
	var extra []string
	for _, line := range strings.Split(list, "\n") {
		f := strings.Fields(line)
		// A removed feature no longer exists in this version, whatever state it reports.
		if len(f) < 3 || f[len(f)-1] != "true" || f[1] == "removed" {
			continue
		}
		if !safe[f[0]] {
			extra = append(extra, f[0])
		}
	}
	sort.Strings(extra)
	return extra
}

// CodexEffectiveFeatures lists Codex's features as a run sees them: Control Rod's switches applied
// and no user configuration (a run ignores it), so only defaults and managed settings count.
func CodexEffectiveFeatures(ctx context.Context) (string, error) {
	tmp, err := os.MkdirTemp("", "controlrod-codex-features-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(tmp)
	args := []string{"features", "list"}
	for _, f := range CodexDisabledFeatures {
		args = append(args, "--disable", f)
	}
	c, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	cmd := exec.CommandContext(c, "codex", args...)
	cmd.Env = append(AgentEnv(os.Environ()), "CODEX_HOME="+tmp)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

// LookPathAgent finds a program on the PATH an agent CLI receives (AgentEnv), not the daemon's own.
func LookPathAgent(name string) (string, error) {
	path := ""
	for _, kv := range AgentEnv(os.Environ()) {
		if v, ok := strings.CutPrefix(kv, "PATH="); ok {
			path = v
		}
	}
	for _, dir := range filepath.SplitList(path) {
		if dir == "" {
			continue
		}
		p := filepath.Join(dir, name)
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() && fi.Mode()&0o111 != 0 {
			return p, nil
		}
	}
	return "", fmt.Errorf("%s is not on the agent PATH", name)
}
