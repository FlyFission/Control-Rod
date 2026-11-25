package runner

import (
	"fmt"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

// The Grok ACP bridge (change record grok-seat). The daemon runs it as `controlrod grok-bridge`;
// see grokAdapter for what it fences and why. Everything it reads from Grok is untrusted: a
// request it does not know is refused, and every command or file access Grok hands it runs under
// the command profile, so the kernel, not this code, decides what a path can reach.

const (
	grokBridgeCommand    = "grok-bridge"
	grokBridgeConfigFlag = "--bridge-config="
	grokDebugLog         = "grok-debug.log"
	grokStderrLog        = "grok-stderr.log"
	grokTmpDir           = "tmp"
	grokTermDir          = "t"
	grokHookID           = "controlrod-gate"
	grokGateReason       = "blocked by Control Rod seat policy: this tool acts outside the sandbox"
	grokFenceReason      = "refused by Control Rod's sandbox"
	grokMaxRead          = 8 << 20
	grokMaxLine          = 64 << 20
)

// grokAllowedTools are the only tools a Grok seat may call: the four Grok hands to the client.
// run_terminal_cmd is the tool's internal id, which the agent profile's allowlist needs (measured
// with 1.0.92: the display name run_terminal_command is "unmappable", and one unmappable entry
// makes Grok keep its full toolset); the hook sees either name.
var grokAllowedTools = []string{"run_terminal_cmd", "run_terminal_command", "read_file", "write", "search_replace"}

var grokProfileTools = []string{"run_terminal_cmd", "read_file", "write", "search_replace"}

// grokAllowlistApplied and grokAllowlistUnmapped are the debug-log lines Grok 1.0.92 writes when it
// applies a session's tool allowlist, and when it ignores it and keeps every tool.
const (
	grokAllowlistApplied  = "tools allowlist applied"
	grokAllowlistUnmapped = "unmappable"
)

// grokHomeReadFiles and grokHomeReadDirs are what the Grok process may read in GROK_HOME (measured
// with 1.0.92 from its debug log; anything else there, hooks and skills included, stays unread).
var (
	grokHomeReadDirs  = []string{"downloads", "bin", "bundled", "sessions", "logs"}
	grokHomeReadFiles = []string{"auth.json", "auth.json.lock", "auth.json.commit.lock", "config.toml",
		"models_cache.json", "models_cache.json.lock", "settings_cache.json", "version.json", ".metadata_version",
		"agent_id", "experiments_remote.json", "experiments_remote_opt_out", "managed_config.toml",
		"managed_config.lock", "requirements.toml", "trusted_folders.toml", "sandbox.toml", ".config-init.lock"}
	grokHomeWriteDirs  = []string{"sessions", "logs"}
	grokHomeWriteFiles = []string{"auth.json.lock", "auth.json.commit.lock", "models_cache.json.lock",
		".config-init.lock", "managed_config.lock"}
)

// grokTermDeniedPrograms are programs a command may never start: the Keychain tool and programs
// that hand work to the desktop session outside the sandbox.
var grokTermDeniedPrograms = []string{"/usr/bin/security", "/usr/bin/osascript", "/usr/bin/open",
	"/bin/launchctl", "/usr/bin/sudo", "/usr/bin/su", "/usr/bin/login", "/usr/bin/pbcopy", "/usr/bin/pbpaste"}

// grokTermDeniedServices are the system services a command may not reach.
var grokTermDeniedServices = []string{"com.apple.SecurityServer", "com.apple.securityd", "com.apple.pasteboard.1",
	"com.apple.coreservices.appleevents", "com.apple.coreservices.launchservicesd"}

// grokBridgeConfig is everything the bridge needs, computed by the daemon and passed inline, never
// as a file, so nothing an agent can write configures the run.
type grokBridgeConfig struct {
	Workspace string   `json:"workspace"`
	RunHome   string   `json:"run_home"`
	GrokHome  string   `json:"grok_home"`
	Denied    []string `json:"denied"`
	// DeniedPrefixes are path prefixes denied to reads: other runs' folders in the shared
	// temporary folders, whose names Control Rod controls.
	DeniedPrefixes []string `json:"denied_prefixes,omitempty"`
	WriteDirs      []string `json:"write_dirs"`
	WriteFiles     []string `json:"write_files,omitempty"`
	Hosts          []string `json:"hosts"`
	Prompt         string   `json:"prompt"`
	Checker        bool     `json:"checker,omitempty"`
}

func (c *grokBridgeConfig) termHome() string { return filepath.Join(c.RunHome, grokTermDir) }

// bridgeExeIndex is where launch by digest puts the verified grok path in a bridge command: just
// after the "--" that ends the bridge's own arguments. It is 0 for any other command.
func bridgeExeIndex(args []string) int {
	if len(args) < 4 || args[1] != grokBridgeCommand {
		return 0
	}
	if i := slices.Index(args, "--"); i > 0 && i+1 < len(args) {
		return i + 1
	}
	return 0
}

// ancestors are the folders above p, from "/" down.
func ancestors(p string) []string {
	var out []string
	for d := filepath.Dir(p); ; d = filepath.Dir(d) {
		out = append(out, d)
		if d == filepath.Dir(d) {
			break
		}
	}
	slices.Reverse(out)
	return out
}

// safePrefix is a path prefix that can be written as a Seatbelt regex without escapes.
var safePrefix = regexp.MustCompile(`^/[A-Za-z0-9/._-]+$`)

// prefixRegexes are Seatbelt regex literals matching every path that starts with one of prefixes.
// A dot is written as [.]; a prefix with any other special character is not one Control Rod makes,
// and parseBridgeArgs refuses it.
func prefixRegexes(prefixes []string) []string {
	out := make([]string, 0, len(prefixes))
	for _, p := range prefixes {
		out = append(out, "^"+strings.ReplaceAll(p, ".", "[.]"))
	}
	return out
}

func sbplRule(b *strings.Builder, action, op, filter string, paths []string) {
	if len(paths) == 0 {
		return
	}
	b.WriteString("(" + action + " " + op)
	for _, p := range paths {
		if filter == "regex" {
			b.WriteString("\n    (regex #" + sbplString(p) + ")")
			continue
		}
		b.WriteString("\n    (" + filter + " " + sbplString(p) + ")")
	}
	b.WriteString(")\n")
}

var grokDevWrites = []string{"/dev/null", "/dev/tty", "/dev/dtracehelper"}

// grokProcessProfile is the Seatbelt profile the Grok process runs under. Rules are matched last
// first, so the allows after a deny reopen only the named paths inside it.
func grokProcessProfile(c *grokBridgeConfig, exe string, proxyPort int) string {
	var b strings.Builder
	b.WriteString("(version 1)\n(allow default)\n")
	// Network only to the bridge's proxy, which allows Grok's own hosts.
	b.WriteString("(deny network-outbound)\n")
	b.WriteString(fmt.Sprintf("(allow network-outbound\n    (remote ip \"localhost:%d\"))\n", proxyPort))
	b.WriteString("(deny file-write*)\n")
	sbplRule(&b, "deny", "file-read*", "subpath", c.Denied)
	sbplRule(&b, "deny", "file-read*", "regex", prefixRegexes(c.DeniedPrefixes))
	var meta []string
	for _, p := range []string{c.Workspace, c.RunHome, c.GrokHome, exe} {
		meta = append(meta, ancestors(p)...)
	}
	meta = append(meta, c.GrokHome)
	slices.Sort(meta)
	sbplRule(&b, "allow", "file-read-metadata", "literal", slices.Compact(meta))
	reads := []string{c.Workspace, c.RunHome}
	for _, d := range grokHomeReadDirs {
		reads = append(reads, filepath.Join(c.GrokHome, d))
	}
	sbplRule(&b, "allow", "file-read*", "subpath", reads)
	var files []string
	for _, f := range grokHomeReadFiles {
		files = append(files, filepath.Join(c.GrokHome, f))
	}
	files = append(files, exe)
	sbplRule(&b, "allow", "file-read*", "literal", files)
	// The Grok process never writes the workspace: its writes go through the bridge.
	writes := []string{c.RunHome}
	for _, d := range grokHomeWriteDirs {
		writes = append(writes, filepath.Join(c.GrokHome, d))
	}
	sbplRule(&b, "allow", "file-write*", "subpath", writes)
	files = files[:0]
	for _, f := range grokHomeWriteFiles {
		files = append(files, filepath.Join(c.GrokHome, f))
	}
	files = append(files, grokDevWrites...)
	sbplRule(&b, "allow", "file-write*", "literal", files)
	// The commands' own folder is readable to commands, so the Grok process (which reads the
	// login) may not write there: nothing it holds can be handed to a command that way.
	sbplRule(&b, "deny", "file-write*", "subpath", []string{c.termHome()})
	return b.String()
}

// grokCommandProfile is the Seatbelt profile every command and every file read or write Grok hands
// the bridge runs under: no network, none of the denied folders, none of the run home but the
// commands' own folder, and writes only where the role may write.
func grokCommandProfile(c *grokBridgeConfig) string {
	var b strings.Builder
	b.WriteString("(version 1)\n(allow default)\n(deny network*)\n(deny file-write*)\n")
	sbplRule(&b, "deny", "file-read*", "subpath", append(slices.Clone(c.Denied), c.RunHome))
	sbplRule(&b, "deny", "file-read*", "regex", prefixRegexes(c.DeniedPrefixes))
	var meta []string
	for _, p := range []string{c.Workspace, c.termHome()} {
		meta = append(meta, ancestors(p)...)
	}
	slices.Sort(meta)
	sbplRule(&b, "allow", "file-read-metadata", "literal", slices.Compact(meta))
	sbplRule(&b, "allow", "file-read*", "subpath", []string{c.Workspace, c.termHome()})
	sbplRule(&b, "allow", "file-write*", "subpath", append(slices.Clone(c.WriteDirs), c.termHome()))
	sbplRule(&b, "allow", "file-write*", "literal", append(slices.Clone(c.WriteFiles), grokDevWrites...))
	sbplRule(&b, "deny", "process-exec", "literal", grokTermDeniedPrograms)
	// The services behind those programs too, so a copy of one is refused as well: the Keychain,
	// the clipboard, Apple Events and Launch Services (which starts programs outside the sandbox).
	sbplRule(&b, "deny", "mach-lookup", "global-name", grokTermDeniedServices)
	return b.String()
}

// grokEnvDropped are variables neither Grok nor a command receives from the daemon's environment
// or from Grok's terminal request.
func grokEnvDropped(k string) bool {
	up := strings.ToUpper(k)
	switch up {
	case "HOME", "TMPDIR", "GROK_HOME", "GROK_CONFIG", "GROK_CONFIG_PATH", "GROK_SANDBOX", "CDPATH", "ENV", "BASH_ENV", "ZDOTDIR", "PROMPT_COMMAND":
		return true
	}
	return strings.HasSuffix(up, "_PROXY") || strings.HasPrefix(up, "DYLD_") || strings.HasPrefix(up, "LD_") ||
		strings.HasPrefix(up, "BASH_FUNC_") || strings.Contains(up, "BASE_URL") || strings.HasSuffix(up, "_API_KEY") ||
		strings.HasSuffix(up, "_TOKEN")
}

func cleanEnv(env []string) []string {
	var out []string
	for _, kv := range env {
		k, _, ok := strings.Cut(kv, "=")
		if ok && k != "" && !grokEnvDropped(k) {
			out = append(out, kv)
		}
	}
	return out
}

// grokProcessEnv is Grok's environment: the run home as HOME, the real login folder as GROK_HOME,
// no telemetry, experiments or self-update, and the bridge's proxy.
func grokProcessEnv(base []string, c *grokBridgeConfig, proxy string) []string {
	env := cleanEnv(base)
	env = append(env, "HOME="+c.RunHome, "GROK_HOME="+c.GrokHome, "TMPDIR="+filepath.Join(c.RunHome, grokTmpDir)+"/",
		"GROK_TELEMETRY_ENABLED=0", "DISABLE_TELEMETRY=1", "DISABLE_ERROR_REPORTING=1",
		"GROK_DISABLE_AUTOUPDATER=1", "GROK_DISABLE_EXPERIMENTS=1")
	return setProxyEnv(env, proxy)
}

// grokCommandEnv is a command's environment: the daemon's (cleaned), then what Grok asked for
// (cleaned), then the commands' own home and temporary folder.
func grokCommandEnv(base []string, asked []acpEnvVar, c *grokBridgeConfig) []string {
	env := cleanEnv(base)
	for _, v := range asked {
		if v.Name != "" && !strings.ContainsAny(v.Name, "=\x00") && !grokEnvDropped(v.Name) && !strings.HasPrefix(strings.ToUpper(v.Name), "GROK_") {
			env = withEnv(env, v.Name+"="+v.Value)
		}
	}
	return append(env, "HOME="+c.termHome(), "TMPDIR="+filepath.Join(c.termHome(), "tmp")+"/")
}

type acpEnvVar struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}
