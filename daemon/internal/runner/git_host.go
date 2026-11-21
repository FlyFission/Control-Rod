// Ported from GoogleCloudPlatform/scion pkg/util/git_host.go (commit 8845a940763f91519d25e72cde3762d6e31df4cb, Apache-2.0).
// Modified for Control-Rod daemon/internal/runner: stripped scion-specific credential helper and ceiling allowlists.
// The repository filter-driver pins and the after-run check are carried from upstream
// (change record .nuclear/changes/host-git-filter-pins/).

package runner

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

// HostGitArgs returns the -c configuration flags prepended to every host-side git
// invocation so repository-local or user git config cannot execute hooks, fsmonitor
// helpers, custom external transports, or recursive submodule fetches on the host.
func HostGitArgs() []string {
	return []string{
		"-c", "core.hooksPath=" + os.DevNull,
		"-c", "core.fsmonitor=false",
		"-c", "core.pager=cat",
		"-c", "protocol.ext.allow=never",
		"-c", "protocol.file.allow=user",
		"-c", "submodule.recurse=false",
		"-c", "fetch.recurseSubmodules=false",
		"-c", "merge.verifySignatures=false",
		"-c", "commit.gpgsign=false",
		"-c", "tag.gpgsign=false",
	}
}

// HostGitNetworkArgs returns HostGitArgs plus a strict transport allowlist for
// remote git operations (http, https, ssh, git only).
func HostGitNetworkArgs() []string {
	base := HostGitArgs()
	net := []string{
		"-c", "protocol.allow=never",
		"-c", "protocol.http.allow=always",
		"-c", "protocol.https.allow=always",
		"-c", "protocol.ssh.allow=always",
		"-c", "protocol.git.allow=always",
	}
	return append(base, net...)
}

var hostGitEnvKept = map[string]bool{
	"GIT_CONFIG_GLOBAL":               true,
	"GIT_CONFIG_SYSTEM":               true,
	"GIT_CONFIG_NOSYSTEM":             true,
	"GIT_SSH":                         true,
	"GIT_SSH_COMMAND":                 true,
	"GIT_SSH_VARIANT":                 true,
	"GIT_ASKPASS":                     true,
	"GIT_TERMINAL_PROMPT":             true,
	"GIT_SSL_CAINFO":                  true,
	"GIT_SSL_CAPATH":                  true,
	"GIT_ALLOW_PROTOCOL":              true,
	"GIT_HTTP_USER_AGENT":             true,
	"GIT_CEILING_DIRECTORIES":         true,
	"GIT_TEST_ASSUME_DIFFERENT_OWNER": true,
}

// HostGitEnv filters env to remove inherited GIT_* variables (such as GIT_DIR,
// GIT_WORK_TREE, GIT_INDEX_FILE, GIT_CONFIG_PARAMETERS, GIT_EXEC_PATH) except
// the safe host operator keys in hostGitEnvKept.
func HostGitEnv(env []string) []string {
	out := make([]string, 0, len(env))
	for _, kv := range env {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GIT_") && !hostGitEnvKept[k] {
			continue
		}
		out = append(out, kv)
	}
	return out
}

// ErrRepoConfigChanged is returned (wrapped) when the repository filter-driver
// config a host-side git command depended on changed while the command ran.
var ErrRepoConfigChanged = errors.New("the repository's git config changed while host-side git ran")

// filterDriverVars are the per-driver variables git reads for a filter
// driver (gitattributes(5)).
var filterDriverVars = []string{"clean", "smudge", "process", "required"}

// hostGitVerifyTimeout bounds the after-run read of the repository config,
// which runs git with a fresh context. Upstream's value.
const hostGitVerifyTimeout = 30 * time.Second

// repoConfigScope reports whether a git config scope is part of the
// repository (and so writable by whoever can write the repository's .git):
// "local" is .git/config, "worktree" a worktree's config.worktree. Entries
// from included files carry the scope of the including file.
func repoConfigScope(scope string) bool {
	return scope == "local" || scope == "worktree"
}

type gitConfigEntry struct {
	scope string
	key   string
	value string
	// hasValue is false for a valueless boolean entry ("key" with no "\n"),
	// which git treats as true. It distinguishes that from an explicit empty
	// value ("key\n").
	hasValue bool
}

// parseGitConfigList parses `git config --show-scope -z --list` output:
// records "<scope>\0<key>\n<value>\0", or "<scope>\0<key>\0" for a valueless
// boolean key.
func parseGitConfigList(out []byte) []gitConfigEntry {
	fields := bytes.Split(out, []byte{0})
	var entries []gitConfigEntry
	for i := 0; i+1 < len(fields); i += 2 {
		scope := string(fields[i])
		kv := string(fields[i+1])
		key, value, hasValue := strings.Cut(kv, "\n")
		entries = append(entries, gitConfigEntry{scope: scope, key: key, value: value, hasValue: hasValue})
	}
	return entries
}

// splitConfigKey splits a config key into section, subsection and
// variable: "filter.My.Driver.smudge" is ("filter", "My.Driver", "smudge").
// The subsection is empty for a two-part key.
func splitConfigKey(key string) (section, subsection, variable string) {
	first := strings.Index(key, ".")
	last := strings.LastIndex(key, ".")
	if first < 0 {
		return key, "", ""
	}
	if first == last {
		return key[:first], "", key[last+1:]
	}
	return key[:first], key[first+1 : last], key[last+1:]
}

// filterDriverKey reports whether key is a filter driver variable,
// "filter.<name>.<variable>", and returns the driver name and variable. The
// name may be empty: "filter..clean" defines the driver a ".gitattributes"
// line "filter=" selects, which splitConfigKey cannot tell apart from the
// two-part key "filter.clean".
func filterDriverKey(key string) (name, variable string, ok bool) {
	section, name, variable := splitConfigKey(key)
	if !strings.EqualFold(section, "filter") || strings.Count(key, ".") < 2 {
		return "", "", false
	}
	return name, variable, true
}

// listGitConfig runs `git config --show-scope -z --list` in dir with the
// leading args lead and env, and parses the result.
func listGitConfig(ctx context.Context, dir string, lead, env []string) ([]gitConfigEntry, error) {
	listArgs := append(append([]string{}, lead...), "config", "--show-scope", "-z", "--list")
	cmd := exec.CommandContext(ctx, "git", listArgs...)
	cmd.Dir = dir
	cmd.Env = env
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("read git config in %s: %w: %s", dir, err, strings.TrimSpace(stderr.String()))
	}
	return parseGitConfigList(out), nil
}

// repoFilterEntries returns the repository-scope filter driver entries
// (clean, smudge, process, required) as "scope\0key\0value" strings in
// listing order: the set the after-run check compares.
func repoFilterEntries(entries []gitConfigEntry) []string {
	var out []string
	for _, e := range entries {
		if !repoConfigScope(e.scope) {
			continue
		}
		_, variable, ok := filterDriverKey(e.key)
		if !ok {
			continue
		}
		if !slices.Contains(filterDriverVars, strings.ToLower(variable)) {
			continue
		}
		v := e.value
		if !e.hasValue {
			v = "\x00true"
		}
		out = append(out, e.scope+"\x00"+e.key+"\x00"+v)
	}
	return out
}

// configPin is one config setting HostGitCommand passes to git with
// command-line precedence.
type configPin struct{ key, value string }

// filterPins returns, for every filter driver variable (clean, smudge,
// process, required) the repository config sets, a setting that re-sets
// it to its global/system value, or, when there is none, to the empty value
// (no command; an empty process disables the whole driver) and required to
// false. Variables the repository does not set keep their global/system
// value. A valueless trusted entry (git reads it as true) is pinned as
// "true".
func filterPins(entries []gitConfigEntry) []configPin {
	repoDrivers := map[string]map[string]bool{}
	trusted := map[string]string{}
	for _, e := range entries {
		subsection, variable, isFilter := filterDriverKey(e.key)
		if repoConfigScope(e.scope) {
			if isFilter {
				v := strings.ToLower(variable)
				if slices.Contains(filterDriverVars, v) {
					if repoDrivers[subsection] == nil {
						repoDrivers[subsection] = map[string]bool{}
					}
					repoDrivers[subsection][v] = true
				}
			}
			continue
		}
		if (e.scope == "system" || e.scope == "global") && isFilter {
			// Later entries win, as in git: system is listed before global.
			value := e.value
			if !e.hasValue {
				value = "true"
			}
			trusted[subsection+"."+strings.ToLower(variable)] = value
		}
	}

	names := make([]string, 0, len(repoDrivers))
	for name := range repoDrivers {
		names = append(names, name)
	}
	sort.Strings(names)
	var pins []configPin
	for _, name := range names {
		for _, v := range filterDriverVars {
			if !repoDrivers[name][v] {
				continue
			}
			value, ok := trusted[name+"."+v]
			if !ok && v == "required" {
				value = "false"
			}
			pins = append(pins, configPin{key: "filter." + name + "." + v, value: value})
		}
	}
	return pins
}

// pinEnv encodes pins as GIT_CONFIG_COUNT, GIT_CONFIG_KEY_<n> and
// GIT_CONFIG_VALUE_<n>, which git applies with command-line precedence,
// above every config file including files pulled in with include.path. It
// is used instead of -c because git splits a -c argument at its first "=",
// and a driver name may contain one: "-c filter.a=b.smudge=" would set
// filter.a and leave driver "a=b" in effect. The environment keeps the key
// whole. env must not already carry GIT_CONFIG_COUNT (HostGitEnv drops it).
func pinEnv(pins []configPin) []string {
	if len(pins) == 0 {
		return nil
	}
	out := []string{"GIT_CONFIG_COUNT=" + strconv.Itoa(len(pins))}
	for i, p := range pins {
		out = append(out,
			"GIT_CONFIG_KEY_"+strconv.Itoa(i)+"="+p.key,
			"GIT_CONFIG_VALUE_"+strconv.Itoa(i)+"="+p.value)
	}
	return out
}

// HostGitCmd is a host-side git command built by HostGitCommand. Run,
// Output and CombinedOutput run it and then read the repository config
// again: if the repository filter-driver entries it was built from changed,
// they return an error wrapping ErrRepoConfigChanged, after logging it,
// whatever the command's own result. Calling Start and Wait on the embedded
// *exec.Cmd directly skips that check.
type HostGitCmd struct {
	*exec.Cmd
	verify func() error
}

// Run runs the command, then checks the repository config.
func (c *HostGitCmd) Run() error {
	return c.after(c.Cmd.Run())
}

// Output runs the command and returns its standard output, then checks the
// repository config.
func (c *HostGitCmd) Output() ([]byte, error) {
	out, err := c.Cmd.Output()
	return out, c.after(err)
}

// CombinedOutput runs the command and returns its combined output, then
// checks the repository config.
func (c *HostGitCmd) CombinedOutput() ([]byte, error) {
	out, err := c.Cmd.CombinedOutput()
	return out, c.after(err)
}

func (c *HostGitCmd) after(runErr error) error {
	if c.verify == nil {
		return runErr
	}
	if err := c.verify(); err != nil {
		slog.Error("host-side git: repository config changed while the command ran",
			"dir", c.Dir, "args", c.Args, "error", err)
		if runErr != nil {
			return fmt.Errorf("%w (command error: %v)", err, runErr)
		}
		return err
	}
	return runErr
}

// HostGitCommand builds a git command run in dir with HostGitArgs and then
// args, and the environment scrubbed by HostGitEnv(os.Environ()) plus the
// repository filter-driver pins (pinEnv). Use it for host-side commands in a repository
// an agent can write, above all those that write the work tree (worktree
// add, checkout, switch, merge) or refresh the index (status, add).
//
// It reads the config git sees in dir once, through git, before building the
// command, to compute the pins; running the returned command reads it again
// and fails (ErrRepoConfigChanged) if the repository's filter-driver entries
// changed. dir is required: an empty dir is refused rather than running git
// in the daemon's own working directory.
//
// Not carried from upstream: the deny-by-default policy that refuses a
// repository config with an include directive or a key outside an allowlist,
// the discovery ceiling, and the LFS and credential options. See the change
// record for what that leaves open.
func HostGitCommand(ctx context.Context, dir string, args ...string) (*HostGitCmd, error) {
	if dir == "" {
		return nil, errors.New("HostGitCommand: dir is required")
	}
	env := HostGitEnv(os.Environ())
	lead := HostGitArgs()
	entries, err := listGitConfig(ctx, dir, lead, env)
	if err != nil {
		return nil, err
	}
	before := repoFilterEntries(entries)
	pins := filterPins(entries)
	cmdEnv := append(append([]string{}, env...), pinEnv(pins)...)
	full := append(append([]string{}, lead...), args...)
	cmd := exec.CommandContext(ctx, "git", full...)
	cmd.Dir = dir
	cmd.Env = cmdEnv
	verify := func() error {
		// A fresh context: the command's own may have expired.
		vctx, cancel := context.WithTimeout(context.Background(), hostGitVerifyTimeout)
		defer cancel()
		again, err := listGitConfig(vctx, dir, lead, env)
		if err != nil {
			return fmt.Errorf("%w: %v", ErrRepoConfigChanged, err)
		}
		if after := repoFilterEntries(again); !slices.Equal(before, after) {
			return fmt.Errorf("%w: repository filter drivers differ", ErrRepoConfigChanged)
		}
		return nil
	}
	return &HostGitCmd{Cmd: cmd, verify: verify}, nil
}
