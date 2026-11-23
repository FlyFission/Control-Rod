//go:build unix

package runner

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// The probe runs what a launch runs: the resolved artifact with its own environment, for every
// command (version, login help, login status), not the wrapper script found on the PATH (Codex
// installed through npm is a Node wrapper), and it resolves only once.
func TestEveryCodexProbeCommandRunsTheResolvedArtifactWithItsEnvironment(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "bin")
	if err := os.Mkdir(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	// The wrapper would need a program this PATH does not have, like `node` under launchd.
	writeFile(t, filepath.Join(bin, "codex"), []byte("#!/usr/bin/env no-such-node\n"), 0o755)
	native := filepath.Join(dir, "native-codex")
	// Each command answers only when it sees the artifact's environment.
	writeFile(t, native, []byte(`#!/bin/sh
[ "$CODEX_MANAGED_BY_NPM" = 1 ] || exit 3
case "$1 $2" in
  "--version ") echo "codex-cli native" ;;
  "login --help") printf 'Commands:\n  status  Show login status\n' ;;
  "login status") echo "Logged in" ;;
  *) exit 2 ;;
esac
`), 0o755)
	t.Setenv("PATH", bin+string(os.PathListSeparator)+"/usr/bin:/bin")
	t.Setenv("HOME", t.TempDir())
	calls := 0
	old := resolveArtifact
	resolveArtifact = func(name string) (RuntimeArtifact, error) {
		calls++
		if name != "codex" || calls > 1 {
			return RuntimeArtifact{}, os.ErrNotExist
		}
		return RuntimeArtifact{Path: native, Env: []string{"CODEX_MANAGED_BY_NPM=1"}}, nil
	}
	t.Cleanup(func() { resolveArtifact = old })

	st := Probe(context.Background(), RuntimeCodex, "", ExecRunner)
	if !st.Ready || !st.LoginChecked || st.Version != "codex-cli native" {
		t.Fatalf("every probe command must run the artifact with its environment: %+v", st)
	}
	if calls != 1 {
		t.Fatalf("resolveArtifact ran %d times; a probe resolves once", calls)
	}
	// Its preflight context carries the same artifact, so the preflight checks the same file.
	if art, err := probedArtifact(preflightContext(context.Background(), st), "codex"); err != nil || art.Path != native {
		t.Fatalf("preflight would check %q (%v); want the probed artifact", art.Path, err)
	}
}

// Outside a probe, a command runs from the agent PATH, as before, and a launcher the resolver
// refused is never chosen by a fallback here.
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
