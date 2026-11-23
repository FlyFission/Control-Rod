//go:build unix

package runner

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The probe runs what a launch runs: the resolved artifact with its own environment, not the
// wrapper script found on the PATH (Codex installed through npm is a Node wrapper).
func TestExecRunnerRunsTheResolvedArtifactNotThePATHWrapper(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.Mkdir(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	// The wrapper would need a program this PATH does not have, like `node` under launchd.
	writeFile(t, filepath.Join(bin, "codex"), []byte("#!/usr/bin/env no-such-node\n"), 0o755)
	native := filepath.Join(dir, "native-codex")
	writeFile(t, native, []byte("#!/bin/sh\necho \"native $CODEX_MANAGED_BY_NPM $1\"\n"), 0o755)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+"/usr/bin:/bin")
	old := resolveArtifact
	resolveArtifact = func(name string) (RuntimeArtifact, error) {
		if name != "codex" {
			return RuntimeArtifact{}, os.ErrNotExist
		}
		return RuntimeArtifact{Path: native, Env: []string{"CODEX_MANAGED_BY_NPM=1"}}, nil
	}
	t.Cleanup(func() { resolveArtifact = old })

	out, code, err := ExecRunner(context.Background(), "codex", "--version")
	if err != nil || code != 0 || strings.TrimSpace(out) != "native 1 --version" {
		t.Fatalf("ExecRunner ran %q (exit %d, %v); want the artifact with its environment", out, code, err)
	}
}

// A name that does not resolve to an artifact still runs from the agent PATH, as before.
func TestExecRunnerFallsBackToThePATHEntry(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "tool"), []byte("#!/bin/sh\necho path-entry\n"), 0o755)
	t.Setenv("PATH", dir+string(os.PathListSeparator)+"/usr/bin:/bin")
	old := resolveArtifact
	resolveArtifact = func(string) (RuntimeArtifact, error) { return RuntimeArtifact{}, ErrUnsupportedLauncher }
	t.Cleanup(func() { resolveArtifact = old })
	out, code, err := ExecRunner(context.Background(), "tool")
	if err != nil || code != 0 || strings.TrimSpace(out) != "path-entry" {
		t.Fatalf("ExecRunner ran %q (exit %d, %v); want the PATH entry", out, code, err)
	}
}
