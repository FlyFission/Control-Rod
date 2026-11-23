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

// A probe runs the artifact it identified, once: no second resolution that could find another
// binary after an upgrade, rehash inside the deadline, or fall back to the PATH entry.
func TestAProbeRunsTheArtifactItIdentifiedWithoutResolvingAgain(t *testing.T) {
	dir := t.TempDir()
	native := filepath.Join(dir, "mycli-1.0")
	writeFile(t, native, []byte("#!/bin/sh\necho \"mycli 1.0\"\n"), 0o755)
	t.Setenv("PATH", "/usr/bin:/bin")
	calls := 0
	old := resolveArtifact
	resolveArtifact = func(string) (RuntimeArtifact, error) {
		calls++
		if calls == 1 {
			return RuntimeArtifact{Path: native}, nil
		}
		// An upgrade in between: a second resolution would find nothing, or something else.
		return RuntimeArtifact{}, os.ErrNotExist
	}
	t.Cleanup(func() { resolveArtifact = old })
	st := Probe(context.Background(), "mycli", "", ExecRunner)
	if !st.Ready || st.Version != "mycli 1.0" || st.Artifact == nil || st.Artifact.Path != native {
		t.Fatalf("the probe must run the artifact it identified: %+v", st)
	}
	if calls != 1 {
		t.Fatalf("resolveArtifact ran %d times; a probe resolves once", calls)
	}
}
