package runner

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestResolveArtifactFollowsSymlinksAndHashes(t *testing.T) {
	dir := t.TempDir()
	real := filepath.Join(dir, "real-cli")
	if err := os.WriteFile(real, []byte("#!/bin/sh\necho hi\n"), 0o755); err != nil {
		t.Fatal(err)
	}
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
	if a.Path != real || a.Digest.Algorithm != "sha256" || len(a.Digest.Value) != 64 {
		t.Fatalf("artifact %+v", a)
	}
}

func TestLaunchIsRefusedWhenTheExecutableIsNotTheExpectedArtifact(t *testing.T) {
	installed := RuntimeArtifact{Path: "/opt/claude/cli.js", Digest: Digest{Algorithm: "sha256", Value: strings.Repeat("a", 64)}}
	old := resolveArtifact
	resolveArtifact = func(string) (RuntimeArtifact, error) { return installed, nil }
	defer func() { resolveArtifact = old }()

	pinned := &RuntimePin{Runtime: "claude", Digest: Digest{Algorithm: "sha256", Value: strings.Repeat("b", 64)}}
	if _, _, err := VerifyLaunch("claude", pinned, nil); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "not the pinned version") {
		t.Fatalf("a pin mismatch must refuse: %v", err)
	}
	pinned.Digest.Value = installed.Digest.Value
	path, dig, err := VerifyLaunch("claude", pinned, nil)
	if err != nil || path != installed.Path || dig.Value != installed.Digest.Value {
		t.Fatalf("the pinned artifact launches by its path: %q %v", path, err)
	}
	probed := &RuntimeArtifact{Path: installed.Path, Digest: Digest{Algorithm: "sha256", Value: strings.Repeat("c", 64)}}
	if _, _, err := VerifyLaunch("claude", nil, probed); !errors.Is(err, ErrArtifactMismatch) || !strings.Contains(err.Error(), "changed after it was last checked") {
		t.Fatalf("an executable swapped since the probe must refuse: %v", err)
	}
	if _, _, err := VerifyLaunch("claude", nil, nil); !errors.Is(err, ErrArtifactMismatch) {
		t.Fatalf("an unchecked executable must refuse: %v", err)
	}
	probed.Digest.Value = installed.Digest.Value
	if _, _, err := VerifyLaunch("claude", nil, probed); err != nil {
		t.Fatalf("unpinned, the probed artifact launches: %v", err)
	}
}
