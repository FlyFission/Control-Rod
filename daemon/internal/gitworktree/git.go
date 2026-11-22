package gitworktree

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"sort"
	"strconv"
	"strings"
)

// HardenedGitArgs returns the -c configuration flags prepended to every host-side
// git invocation so repository or user configuration cannot execute hooks,
// fsmonitor helpers, external transports, or recursive submodules on the host.
func HardenedGitArgs() []string {
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

var keptGitEnvKeys = map[string]bool{
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

// ScrubbedGitEnv filters env to remove inherited GIT_* variables (such as
// GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE, GIT_COMMON_DIR, GIT_CONFIG_PARAMETERS,
// GIT_CONFIG_COUNT, GIT_EXEC_PATH) except the safe host operator keys.
// It also ensures GIT_TERMINAL_PROMPT=0 is set when not already present.
func ScrubbedGitEnv(env []string) []string {
	out := make([]string, 0, len(env)+1)
	hasPrompt := false
	for _, kv := range env {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GIT_") && !keptGitEnvKeys[k] {
			continue
		}
		if k == "GIT_TERMINAL_PROMPT" {
			hasPrompt = true
		}
		out = append(out, kv)
	}
	if !hasPrompt {
		out = append(out, "GIT_TERMINAL_PROMPT=0")
	}
	return out
}

type gitConfigItem struct {
	scope    string
	key      string
	value    string
	hasValue bool
}

var filterDriverKeys = []string{"clean", "smudge", "process", "required"}

func parseGitConfigZ(out []byte) []gitConfigItem {
	fields := bytes.Split(out, []byte{0})
	items := make([]gitConfigItem, 0, len(fields)/2)
	for i := 0; i+1 < len(fields); i += 2 {
		scope := string(fields[i])
		key, val, hasVal := strings.Cut(string(fields[i+1]), "\n")
		items = append(items, gitConfigItem{
			scope:    scope,
			key:      key,
			value:    val,
			hasValue: hasVal,
		})
	}
	return items
}

func splitConfigKey(key string) (section, subsection, variable string) {
	first := strings.IndexByte(key, '.')
	last := strings.LastIndexByte(key, '.')
	if first < 0 {
		return key, "", ""
	}
	if first == last {
		return key[:first], "", key[last+1:]
	}
	return key[:first], key[first+1 : last], key[last+1:]
}

func isRepoScope(scope string) bool {
	return scope == "local" || scope == "worktree"
}

func filterDriverParts(key string) (name, variable string, ok bool) {
	sec, sub, v := splitConfigKey(key)
	if !strings.EqualFold(sec, "filter") || strings.Count(key, ".") < 2 {
		return "", "", false
	}
	return sub, v, true
}

func hasRepoConditionalInclude(items []gitConfigItem) bool {
	for _, it := range items {
		if isRepoScope(it.scope) && strings.HasPrefix(strings.ToLower(it.key), "includeif.") {
			return true
		}
	}
	return false
}

type envConfigPin struct {
	key   string
	value string
}

func computeFilterPins(items []gitConfigItem) []envConfigPin {
	repoDrivers := map[string]map[string]bool{}
	trusted := map[string]string{}
	for _, it := range items {
		sub, variable, isFilter := filterDriverParts(it.key)
		if !isFilter {
			continue
		}
		v := strings.ToLower(variable)
		if !slices.Contains(filterDriverKeys, v) {
			continue
		}
		if isRepoScope(it.scope) {
			if repoDrivers[sub] == nil {
				repoDrivers[sub] = map[string]bool{}
			}
			repoDrivers[sub][v] = true
			continue
		}
		if it.scope == "system" || it.scope == "global" {
			val := it.value
			if !it.hasValue {
				val = "true"
			}
			trusted[sub+"."+v] = val
		}
	}
	names := make([]string, 0, len(repoDrivers))
	for n := range repoDrivers {
		names = append(names, n)
	}
	sort.Strings(names)
	var pins []envConfigPin
	for _, n := range names {
		for _, v := range filterDriverKeys {
			if !repoDrivers[n][v] {
				continue
			}
			val, ok := trusted[n+"."+v]
			if !ok && v == "required" {
				val = "false"
			}
			pins = append(pins, envConfigPin{key: "filter." + n + "." + v, value: val})
		}
	}
	return pins
}

func encodePinEnv(pins []envConfigPin) []string {
	if len(pins) == 0 {
		return nil
	}
	out := make([]string, 0, 1+2*len(pins))
	out = append(out, "GIT_CONFIG_COUNT="+strconv.Itoa(len(pins)))
	for i, p := range pins {
		idx := strconv.Itoa(i)
		out = append(out,
			"GIT_CONFIG_KEY_"+idx+"="+p.key,
			"GIT_CONFIG_VALUE_"+idx+"="+p.value,
		)
	}
	return out
}

type gitOutput struct {
	stdout string
	stderr string
}

func runGitRaw(ctx context.Context, dir string, extraEnv []string, args ...string) (gitOutput, error) {
	if dir == "" {
		return gitOutput{}, errors.New("gitworktree: working directory is required")
	}
	lead := HardenedGitArgs()
	full := make([]string, 0, len(lead)+len(args))
	full = append(full, lead...)
	full = append(full, args...)

	cmd := exec.CommandContext(ctx, "git", full...)
	cmd.Dir = dir
	env := ScrubbedGitEnv(os.Environ())
	if len(extraEnv) > 0 {
		env = append(env, extraEnv...)
	}
	cmd.Env = env

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return gitOutput{
		stdout: stdout.String(),
		stderr: stderr.String(),
	}, err
}

// runHardenedGit runs git in dir with hardened flags, scrubbed environment,
// and repository filter-driver pinning.
func runHardenedGit(ctx context.Context, dir string, args ...string) (gitOutput, error) {
	cfgOut, err := runGitRaw(ctx, dir, nil, "config", "--show-scope", "-z", "--list")
	if err != nil {
		return cfgOut, err
	}
	items := parseGitConfigZ([]byte(cfgOut.stdout))
	if hasRepoConditionalInclude(items) {
		return gitOutput{}, errors.New("gitworktree: repository config contains conditional includeIf")
	}
	pins := computeFilterPins(items)
	return runGitRaw(ctx, dir, encodePinEnv(pins), args...)
}

// physicalAbs resolves path to a clean absolute physical path, resolving symlinks
// across existing path prefixes when the leaf does not yet exist.
func physicalAbs(p string) (string, error) {
	if p == "" {
		return "", errors.New("gitworktree: empty path")
	}
	abs, err := filepath.Abs(p)
	if err != nil {
		return "", err
	}
	abs = filepath.Clean(abs)
	if resolved, err := filepath.EvalSymlinks(abs); err == nil {
		return filepath.Clean(resolved), nil
	} else if !errors.Is(err, os.ErrNotExist) {
		return "", err
	}

	// Walk up until we find an existing ancestor, resolve symlinks there, and reattach suffix.
	cur := abs
	var missing []string
	for {
		parent := filepath.Dir(cur)
		if parent == cur {
			return "", fmt.Errorf("gitworktree: no existing ancestor for path")
		}
		missing = append(missing, filepath.Base(cur))
		cur = parent
		info, err := os.Lstat(cur)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				continue
			}
			return "", err
		}
		// Resolve symlinks on the existing ancestor (including if cur itself is a symlink).
		_ = info
		realBase, err := filepath.EvalSymlinks(cur)
		if err != nil {
			return "", err
		}
		out := realBase
		for i := len(missing) - 1; i >= 0; i-- {
			out = filepath.Join(out, missing[i])
		}
		return filepath.Clean(out), nil
	}
}

func osStatDir(p string) (os.FileInfo, error) {
	info, err := os.Stat(p)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, errors.New("gitworktree: path is not a directory")
	}
	return info, nil
}
