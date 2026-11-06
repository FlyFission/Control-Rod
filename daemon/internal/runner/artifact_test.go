package runner

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"syscall"
	"testing"
	"time"
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
	// Codex is staged first, and staging re-hashes the tree, so the swap is refused there.
	if _, err := VerifyLaunch("codex", pin, nil); !errors.Is(err, ErrArtifactMismatch) ||
		!(strings.Contains(err.Error(), "changed while") || strings.Contains(err.Error(), "does not match")) {
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

func TestCodexTreeRefusesLinks(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "bin", "codex"), append(append([]byte{}, elf...), "codex"...), 0o755)
	if _, _, err := treeDigest(root); err != nil {
		t.Fatal(err)
	}
	// Even a link that looks internal can resolve outside through another link (dir/up -> ..).
	for _, target := range []string{"../bin/codex", "/etc/passwd", "../../outside"} {
		link := filepath.Join(root, "bin", "link")
		if err := os.Symlink(target, link); err != nil {
			t.Fatal(err)
		}
		if _, _, err := treeDigest(root); err == nil || !strings.Contains(err.Error(), "symbolic link") {
			t.Fatalf("a link to %s must be refused: %v", target, err)
		}
		os.Remove(link)
	}
}

// verifiedCopy copies a system executable to a temporary runtime path and verifies it, pinned.
func verifiedCopy(t *testing.T, name string) (string, *VerifiedLaunch) {
	t.Helper()
	src, err := exec.LookPath(name)
	if err != nil {
		t.Skipf("needs %s", name)
	}
	b, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(t.TempDir(), "runtime")
	writeFile(t, path, b, 0o755)
	sum, err := fileDigest(path)
	if err != nil {
		t.Fatal(err)
	}
	old := resolveArtifact
	resolveArtifact = func(string) (RuntimeArtifact, error) {
		return RuntimeArtifact{Path: path, Digest: Digest{Algorithm: "sha256", Value: sum}}, nil
	}
	t.Cleanup(func() { resolveArtifact = old })
	l, err := VerifyLaunch("claude", &RuntimePin{Runtime: "claude", Digest: Digest{Algorithm: "sha256", Value: sum}}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(l.Close)
	return path, l
}

func TestConfirmProvesTheStartedProcessRunsTheVerifiedBytes(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Confirm is Linux only")
	}
	path, l := verifiedCopy(t, "sleep")
	cmd := exec.Command(path, "5")
	l.Apply(cmd)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { cmd.Process.Kill(); cmd.Wait() }()
	if err := l.Confirm(cmd.Process.Pid); err != nil {
		t.Fatalf("an unmodified runtime confirms: %v", err)
	}
	// What makes the confirmation sound: while it executes, the file cannot be opened for writing.
	if f, err := os.OpenFile(path, os.O_WRONLY, 0); err == nil {
		f.Close()
		t.Fatal("an executing runtime must refuse writes (ETXTBSY)")
	} else if !errors.Is(err, syscall.ETXTBSY) {
		t.Fatalf("expected ETXTBSY, got %v", err)
	}
}

func TestAWriteBetweenCheckAndStartIsBlockedAndCaught(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("leases are Linux only")
	}
	path, l := verifiedCopy(t, "sleep")
	if !l.leased {
		t.Skip("this filesystem gives no leases")
	}
	// After the check, opening the runtime for writing does not get through: the open waits on the
	// lease (here, non-blocking, it is refused at once) and the lease is broken.
	if f, err := os.OpenFile(path, os.O_WRONLY|syscall.O_NONBLOCK, 0); err == nil {
		f.Close()
		t.Fatal("a writer must not get the verified runtime open while it is guarded")
	} else if !errors.Is(err, syscall.EWOULDBLOCK) {
		t.Fatalf("expected the open to wait on the lease, got %v", err)
	}
	cmd := exec.Command(path, "5")
	l.Apply(cmd)
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { cmd.Process.Kill(); cmd.Wait() }()
	if err := l.Confirm(cmd.Process.Pid); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "opened the runtime for writing") {
		t.Fatalf("an attempted write in the window must fail the run closed: %v", err)
	}
}

func TestARuntimeOpenForWritingIsRefused(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("leases are Linux only")
	}
	src, err := exec.LookPath("sleep")
	if err != nil {
		t.Skip("needs sleep")
	}
	b, _ := os.ReadFile(src)
	path := filepath.Join(t.TempDir(), "runtime")
	writeFile(t, path, b, 0o755)
	sum, _ := fileDigest(path)
	old := resolveArtifact
	resolveArtifact = func(string) (RuntimeArtifact, error) {
		return RuntimeArtifact{Path: path, Digest: Digest{Algorithm: "sha256", Value: sum}}, nil
	}
	defer func() { resolveArtifact = old }()
	w, err := os.OpenFile(path, os.O_WRONLY, 0)
	if err != nil {
		t.Fatal(err)
	}
	defer w.Close()
	if _, err := VerifyLaunch("claude", &RuntimePin{Runtime: "claude", Digest: Digest{Algorithm: "sha256", Value: sum}}, nil); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "open for writing") {
		t.Fatalf("a runtime someone holds open for writing cannot be guarded, so it is refused: %v", err)
	}
}

func TestConfirmFailsClosedWhenTheProcessNeverRunsTheRuntime(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("Confirm is Linux only")
	}
	old := confirmWait
	confirmWait = 200 * time.Millisecond
	defer func() { confirmWait = old }()
	_, l := verifiedCopy(t, "sleep")
	other := exec.Command("sleep", "5")
	if err := other.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { other.Process.Kill(); other.Wait() }()
	if err := l.Confirm(other.Process.Pid); !errors.Is(err, ErrArtifactMismatch) {
		t.Fatalf("a process running something else must not confirm: %v", err)
	}
}

func TestTheGuardIsCheckedAgainImmediatelyBeforeTheStart(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("leases are Linux only")
	}
	path, l := verifiedCopy(t, "sleep")
	if !l.leased {
		t.Skip("this filesystem gives no leases")
	}
	if err := l.Ready(); err != nil {
		t.Fatalf("a fresh guard is ready: %v", err)
	}
	// Too long since the check: a writer's forced lease expiry could be near.
	l.guardedAt = time.Now().Add(-leaseBreakTime())
	if err := l.Ready(); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "too long passed") {
		t.Fatalf("a stale guard must refuse the start: %v", err)
	}
	l.guardedAt = time.Now()
	if f, err := os.OpenFile(path, os.O_WRONLY|syscall.O_NONBLOCK, 0); err == nil {
		f.Close()
	}
	if err := l.Ready(); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "opened the runtime for writing") {
		t.Fatalf("a broken lease must refuse the start: %v", err)
	}
}
