package runner

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// elf is the start of a native executable, enough for resolution to treat a file as one.
var elf = []byte{0x7f, 'E', 'L', 'F', 2, 1, 1, 0}

func writeFile(t *testing.T, path string, body []byte, mode os.FileMode) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, body, mode); err != nil {
		t.Fatal(err)
	}
}

func TestResolveArtifactFollowsSymlinksAndHashesNativeExecutables(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "real-cli")
	writeFile(t, real, append(append([]byte{}, elf...), "body"...), 0o755)
	bin := filepath.Join(dir, "bin")
	if err := os.Mkdir(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(real, filepath.Join(bin, "mycli")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin)
	a, err := ResolveArtifact("mycli")
	if err != nil {
		t.Fatal(err)
	}
	if a.Path != real || a.Root != "" || a.Digest.Algorithm != "sha256" || len(a.Digest.Value) != 64 {
		t.Fatalf("artifact %+v", a)
	}
}

func TestResolveArtifactRefusesScriptLaunchers(t *testing.T) {
	bin := t.TempDir()
	writeFile(t, filepath.Join(bin, "claude"), []byte("#!/bin/sh\nexec node cli.js \"$@\"\n"), 0o755)
	t.Setenv("PATH", bin)
	_, err := ResolveArtifact("claude")
	if !errors.Is(err, ErrUnsupportedLauncher) || !strings.Contains(err.Error(), "native build") {
		t.Fatalf("a script launcher must be refused, not pinned by its own digest: %v", err)
	}
}

func TestResolveArtifactFollowsTheCodexWrapperToItsNativeTree(t *testing.T) {
	arch := map[string]string{"amd64": "x64", "arm64": "arm64"}[runtime.GOARCH]
	osName := map[string]string{"linux": "linux", "darwin": "darwin"}[runtime.GOOS]
	if arch == "" || osName == "" {
		t.Skip("no Codex platform package for this platform")
	}
	dir := t.TempDir()
	pkg := filepath.Join(dir, "lib", "node_modules", "@openai", "codex")
	writeFile(t, filepath.Join(pkg, "bin", "codex.js"), []byte("#!/usr/bin/env node\n"), 0o755)
	root := filepath.Join(pkg, "node_modules", "@openai", "codex-"+osName+"-"+arch, "vendor", "some-triple")
	exe := filepath.Join(root, "bin", "codex")
	writeFile(t, exe, append(append([]byte{}, elf...), "codex"...), 0o755)
	writeFile(t, filepath.Join(root, "codex-path", "rg"), append(append([]byte{}, elf...), "rg-1"...), 0o755)
	bin := filepath.Join(dir, "bin")
	if err := os.Mkdir(bin, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(pkg, "bin", "codex.js"), filepath.Join(bin, "codex")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin)

	a, err := ResolveArtifact("codex")
	if err != nil {
		t.Fatal(err)
	}
	if a.Path != exe || a.Root != root || a.exeSum == "" {
		t.Fatalf("the artifact is the platform binary and its tree: %+v", a)
	}
	if !strings.Contains(strings.Join(a.Env, " "), "CODEX_MANAGED_PACKAGE_ROOT="+pkg) {
		t.Fatalf("running the binary directly keeps what the wrapper would set: %v", a.Env)
	}
	// A helper the runtime executes is part of the artifact.
	writeFile(t, filepath.Join(root, "codex-path", "rg"), append(append([]byte{}, elf...), "rg-2"...), 0o755)
	b, err := ResolveArtifact("codex")
	if err != nil {
		t.Fatal(err)
	}
	if b.Digest.Value == a.Digest.Value {
		t.Fatal("replacing a helper in the tree must change the artifact digest")
	}
}

func TestLaunchIsRefusedWhenTheExecutableIsNotTheExpectedArtifact(t *testing.T) {
	path := filepath.Join(t.TempDir(), "claude")
	writeFile(t, path, append(append([]byte{}, elf...), "claude"...), 0o755)
	sum, err := fileDigest(path)
	if err != nil {
		t.Fatal(err)
	}
	installed := RuntimeArtifact{Path: path, Digest: Digest{Algorithm: "sha256", Value: sum}}
	old := resolveArtifact
	resolveArtifact = func(string) (RuntimeArtifact, error) { return installed, nil }
	defer func() { resolveArtifact = old }()

	pinned := &RuntimePin{Runtime: "claude", Digest: Digest{Algorithm: "sha256", Value: strings.Repeat("b", 64)}}
	if _, err := VerifyLaunch("claude", pinned, nil); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "not the pinned version") {
		t.Fatalf("a pin mismatch must refuse: %v", err)
	}
	pinned.Digest.Value = sum
	l, err := VerifyLaunch("claude", pinned, nil)
	if err != nil || l.Path != path || l.Digest.Value != sum || l.File == nil {
		t.Fatalf("the pinned artifact launches from an open descriptor: %+v %v", l, err)
	}
	l.Close()
	probed := &RuntimeArtifact{Path: path, Digest: Digest{Algorithm: "sha256", Value: strings.Repeat("c", 64)}}
	if _, err := VerifyLaunch("claude", nil, probed); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "changed after it was last checked") {
		t.Fatalf("an executable swapped since the probe must refuse: %v", err)
	}
	if _, err := VerifyLaunch("claude", nil, nil); !errors.Is(err, ErrArtifactMismatch) {
		t.Fatalf("an unchecked executable must refuse: %v", err)
	}
	probed.Digest.Value = sum
	l, err = VerifyLaunch("claude", nil, probed)
	if err != nil {
		t.Fatalf("unpinned, the probed artifact launches: %v", err)
	}
	l.Close()

	// The digest is taken from the opened file, not from what resolution reported.
	writeFile(t, path, append(append([]byte{}, elf...), "swapped"...), 0o755)
	if _, err := VerifyLaunch("claude", pinned, nil); !errors.Is(err, ErrArtifactMismatch) {
		t.Fatalf("bytes changed after resolution must refuse: %v", err)
	}
}

func TestTreeLaunchRefusesAnExecutableTheTreeDigestDidNotCount(t *testing.T) {
	root := t.TempDir()
	exe := filepath.Join(root, "bin", "codex")
	writeFile(t, exe, append(append([]byte{}, elf...), "codex"...), 0o755)
	tree := Digest{Algorithm: "sha256", Value: strings.Repeat("d", 64)}
	old := resolveArtifact
	resolveArtifact = func(string) (RuntimeArtifact, error) {
		return RuntimeArtifact{Path: exe, Root: root, Digest: tree, exeSum: strings.Repeat("e", 64)}, nil
	}
	defer func() { resolveArtifact = old }()
	pin := &RuntimePin{Runtime: "codex", Digest: tree}
	if _, err := VerifyLaunch("codex", pin, nil); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "changed while") {
		t.Fatalf("an executable replaced between hashing and opening must refuse: %v", err)
	}
}

func TestVerifiedLaunchRunsTheCheckedBytesEvenAfterTheFileIsReplaced(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("descriptor launch is Linux only")
	}
	truePath, err1 := exec.LookPath("true")
	falsePath, err2 := exec.LookPath("false")
	if err1 != nil || err2 != nil {
		t.Skip("needs true and false")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "runtime")
	copyFile := func(src, dst string) {
		b, err := os.ReadFile(src)
		if err != nil {
			t.Fatal(err)
		}
		writeFile(t, dst, b, 0o755)
	}
	copyFile(truePath, path)
	sum, err := fileDigest(path)
	if err != nil {
		t.Fatal(err)
	}
	old := resolveArtifact
	resolveArtifact = func(string) (RuntimeArtifact, error) {
		return RuntimeArtifact{Path: path, Digest: Digest{Algorithm: "sha256", Value: sum}}, nil
	}
	defer func() { resolveArtifact = old }()
	l, err := VerifyLaunch("claude", &RuntimePin{Runtime: "claude", Digest: Digest{Algorithm: "sha256", Value: sum}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()

	// Replace the file at the path after the check: the run still executes the checked bytes.
	copyFile(falsePath, path+".new")
	if err := os.Rename(path+".new", path); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(path)
	l.Apply(cmd)
	if !strings.HasPrefix(cmd.Path, "/proc/self/fd/") || cmd.Args[0] != cmd.Path {
		t.Fatalf("launch goes through the descriptor: %q %q", cmd.Path, cmd.Args)
	}
	if err := cmd.Run(); err != nil {
		t.Fatalf("the verified bytes (true) must run, not the replacement (false): %v", err)
	}
}
