package runner

import (
	"context"
	"slices"
	"strings"
	"testing"
)

func TestHostGitArgsNeutralizesHostExecution(t *testing.T) {
	args := HostGitArgs()
	requiredPairs := [][2]string{
		{"core.hooksPath=/dev/null", "-c"},
		{"core.fsmonitor=false", "-c"},
		{"core.pager=cat", "-c"},
		{"protocol.ext.allow=never", "-c"},
		{"protocol.file.allow=user", "-c"},
		{"submodule.recurse=false", "-c"},
		{"fetch.recurseSubmodules=false", "-c"},
		{"merge.verifySignatures=false", "-c"},
		{"commit.gpgsign=false", "-c"},
		{"tag.gpgsign=false", "-c"},
	}
	for _, pair := range requiredPairs {
		idx := slices.Index(args, pair[0])
		if idx <= 0 || args[idx-1] != pair[1] {
			t.Fatalf("expected %s %s in HostGitArgs(), got %v", pair[1], pair[0], args)
		}
	}
}

func TestHostGitNetworkArgsRestrictsProtocols(t *testing.T) {
	args := HostGitNetworkArgs()
	if !slices.Contains(args, "protocol.allow=never") {
		t.Fatalf("expected protocol.allow=never in HostGitNetworkArgs(), got %v", args)
	}
	if !slices.Contains(args, "protocol.https.allow=always") {
		t.Fatalf("expected protocol.https.allow=always in HostGitNetworkArgs(), got %v", args)
	}
}

func TestHostGitEnvStripsDangerousGitVars(t *testing.T) {
	in := []string{
		"PATH=/usr/bin:/bin",
		"GIT_DIR=/tmp/evil/.git",
		"GIT_WORK_TREE=/tmp/evil",
		"GIT_INDEX_FILE=/tmp/evil/index",
		"GIT_CONFIG_PARAMETERS='core.fsmonitor=evil'",
		"GIT_EXEC_PATH=/tmp/evil-bin",
		"GIT_TERMINAL_PROMPT=0",
		"GIT_SSH_COMMAND=ssh -o BatchMode=yes",
	}
	out := HostGitEnv(in)
	joined := strings.Join(out, "\n")
	for _, forbidden := range []string{"GIT_DIR=", "GIT_WORK_TREE=", "GIT_INDEX_FILE=", "GIT_CONFIG_PARAMETERS=", "GIT_EXEC_PATH="} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("HostGitEnv leaked %s: %v", forbidden, out)
		}
	}
	for _, kept := range []string{"PATH=/usr/bin:/bin", "GIT_TERMINAL_PROMPT=0", "GIT_SSH_COMMAND=ssh -o BatchMode=yes"} {
		if !slices.Contains(out, kept) {
			t.Fatalf("HostGitEnv dropped %s: %v", kept, out)
		}
	}
}

func TestHostGitCommandSetsArgsAndEnv(t *testing.T) {
	t.Setenv("GIT_DIR", "/tmp/should-be-stripped")
	t.Setenv("GIT_TERMINAL_PROMPT", "0")
	cmd := HostGitCommand(context.Background(), "/tmp", "status", "--short")
	if cmd.Dir != "/tmp" {
		t.Fatalf("expected Dir=/tmp, got %q", cmd.Dir)
	}
	if !slices.Contains(cmd.Args, "core.hooksPath=/dev/null") {
		t.Fatalf("expected core.hooksPath=/dev/null in cmd.Args: %v", cmd.Args)
	}
	if cmd.Args[len(cmd.Args)-2] != "status" || cmd.Args[len(cmd.Args)-1] != "--short" {
		t.Fatalf("expected trailing args [status --short], got %v", cmd.Args)
	}
	for _, kv := range cmd.Env {
		if strings.HasPrefix(kv, "GIT_DIR=") {
			t.Fatalf("expected GIT_DIR to be stripped from cmd.Env")
		}
	}
}
