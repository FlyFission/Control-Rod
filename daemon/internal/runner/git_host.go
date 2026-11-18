// Ported from GoogleCloudPlatform/scion pkg/util/git_host.go (commit 8845a940763f91519d25e72cde3762d6e31df4cb, Apache-2.0).
// Modified for Control-Rod daemon/internal/runner: stripped scion-specific credential helper and ceiling allowlists.

package runner

import (
	"context"
	"os"
	"os/exec"
	"strings"
)

// HostGitArgs returns the -c configuration flags prepended to every host-side git
// invocation so repository-local or user git config cannot execute hooks, fsmonitor
// helpers, custom external transports, or recursive submodule fetches on the host.
func HostGitArgs() []string {
	return []string{
		"-c", "core.hooksPath=/dev/null",
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

// HostGitCommand constructs an *exec.Cmd for git with HostGitArgs prepended,
// Dir set, and Env scrubbed via HostGitEnv(os.Environ()).
func HostGitCommand(ctx context.Context, dir string, args ...string) *exec.Cmd {
	fullArgs := append(HostGitArgs(), args...)
	cmd := exec.CommandContext(ctx, "git", fullArgs...)
	if dir != "" {
		cmd.Dir = dir
	}
	cmd.Env = HostGitEnv(os.Environ())
	return cmd
}
