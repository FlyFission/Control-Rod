package artifactstore

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func TestPutGetAndDeduplication(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(dir, Options{MaxBytes: 1024})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	payload := []byte("hello content-addressed world")
	sum := sha256.Sum256(payload)
	wantDigest := hex.EncodeToString(sum[:])

	info1, err := store.Put(context.Background(), bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("Put 1 failed: %v", err)
	}
	if info1.Digest != wantDigest || info1.Size != int64(len(payload)) || info1.AlreadyExisted {
		t.Fatalf("unexpected Put 1 result: %+v", info1)
	}

	info2, err := store.Put(context.Background(), bytes.NewReader(payload))
	if err != nil {
		t.Fatalf("Put 2 failed: %v", err)
	}
	if !info2.AlreadyExisted || info2.Digest != wantDigest {
		t.Fatalf("expected deduplicated Put 2, got %+v", info2)
	}

	got, err := store.ReadBytes(wantDigest)
	if err != nil {
		t.Fatalf("ReadBytes failed: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Fatalf("stored bytes %q != input %q", got, payload)
	}
	if err := store.Verify(wantDigest); err != nil {
		t.Fatalf("Verify failed: %v", err)
	}
}

func TestPutEnforcesMaxBytesAndCleansTemp(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(dir, Options{MaxBytes: 8})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	if _, err := store.Put(context.Background(), bytes.NewReader([]byte("123456789"))); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge, got %v", err)
	}

	tmpEntries, err := os.ReadDir(filepath.Join(dir, "tmp"))
	if err != nil {
		t.Fatal(err)
	}
	if len(tmpEntries) != 0 {
		t.Fatalf("expected empty tmp/ after rejected Put, found %d files", len(tmpEntries))
	}
}

func TestRefusesSymlinkEscapeAndInvalidDigest(t *testing.T) {
	rootDir := t.TempDir()
	outsideDir := t.TempDir()

	secretPath := filepath.Join(outsideDir, "secret.txt")
	if err := os.WriteFile(secretPath, []byte("top-secret"), 0o600); err != nil {
		t.Fatal(err)
	}

	store, err := Open(rootDir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	// Invalid digests (path traversal, uppercase, short) must be refused.
	for _, bad := range []string{"../etc/passwd", "ABCD", stringsRepeat("a", 63), stringsRepeat("A", 64)} {
		if _, _, err := store.Get(bad); !errors.Is(err, ErrInvalidDigest) {
			t.Fatalf("Get(%q) expected ErrInvalidDigest, got %v", bad, err)
		}
	}

	// Plant a symlink at a valid digest path pointing outside rootDir.
	fakeDigest := stringsRepeat("a", 64)
	shardDir := filepath.Join(rootDir, "blobs", fakeDigest[:2])
	if err := os.MkdirAll(shardDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(secretPath, filepath.Join(shardDir, fakeDigest)); err != nil {
		t.Fatal(err)
	}

	if _, _, err := store.Get(fakeDigest); !errors.Is(err, ErrSymlinkRefused) {
		t.Fatalf("expected ErrSymlinkRefused for symlinked blob, got %v", err)
	}

	// Also plant a symlinked shard directory pointing outside rootDir.
	fakeDigest2 := stringsRepeat("b", 64)
	if err := os.Symlink(outsideDir, filepath.Join(rootDir, "blobs", fakeDigest2[:2])); err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Get(fakeDigest2); err == nil {
		t.Fatalf("expected error for symlinked shard directory")
	}
}

func TestVerifyDetectsCorruption(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	info, err := store.Put(context.Background(), bytes.NewReader([]byte("authentic")))
	if err != nil {
		t.Fatal(err)
	}
	blobPath := filepath.Join(dir, info.RelPath)
	if err := os.WriteFile(blobPath, []byte("tampered!"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := store.Verify(info.Digest); !errors.Is(err, ErrDigestMismatch) {
		t.Fatalf("expected ErrDigestMismatch, got %v", err)
	}
}

func TestStabilityTrackerTwoPollAndMutation(t *testing.T) {
	now := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	tracker := NewStabilityTracker(StabilityOptions{
		MinPolls:          2,
		MinStableDuration: 2 * time.Second,
		Now:               func() time.Time { return now },
	})

	ws := t.TempDir()
	filePath := filepath.Join(ws, "output.bin")
	if err := os.WriteFile(filePath, []byte("part1"), 0o600); err != nil {
		t.Fatal(err)
	}
	mtime1 := now.Add(-10 * time.Second)
	if err := os.Chtimes(filePath, mtime1, mtime1); err != nil {
		t.Fatal(err)
	}

	// Poll 1: never stable on first observation.
	if _, stable, err := tracker.PollFile(filePath); err != nil || stable {
		t.Fatalf("poll 1: stable=%v err=%v, want false/nil", stable, err)
	}

	// Mutate file size before Poll 2 -> resets stability.
	if err := os.WriteFile(filePath, []byte("part1+part2"), 0o600); err != nil {
		t.Fatal(err)
	}
	mtime2 := now.Add(-5 * time.Second)
	if err := os.Chtimes(filePath, mtime2, mtime2); err != nil {
		t.Fatal(err)
	}
	now = now.Add(3 * time.Second)
	if _, stable, err := tracker.PollFile(filePath); err != nil || stable {
		t.Fatalf("poll 2 after write: stable=%v err=%v, want false/nil", stable, err)
	}

	// Poll 3 too soon (< MinStableDuration) -> still false.
	now = now.Add(1 * time.Second)
	if _, stable, err := tracker.PollFile(filePath); err != nil || stable {
		t.Fatalf("poll 3 before MinStableDuration: stable=%v err=%v, want false/nil", stable, err)
	}

	// Poll 4 after MinStableDuration with unchanged (size, mtime) -> stable!
	now = now.Add(2 * time.Second)
	if _, stable, err := tracker.PollFile(filePath); err != nil || !stable {
		t.Fatalf("poll 4 stable: stable=%v err=%v, want true/nil", stable, err)
	}

	// Symlink in workspace must be refused.
	linkPath := filepath.Join(ws, "link.bin")
	if err := os.Symlink(filePath, linkPath); err != nil {
		t.Fatal(err)
	}
	if _, _, err := tracker.PollFile(linkPath); !errors.Is(err, ErrSymlinkRefused) {
		t.Fatalf("expected ErrSymlinkRefused, got %v", err)
	}
}

func TestConcurrentPutAndStability(t *testing.T) {
	dir := t.TempDir()
	store, err := Open(dir, Options{})
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	tracker := NewStabilityTracker(StabilityOptions{})
	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			payload := []byte{byte('a' + id), 'x', 'y', 'z'}
			info, err := store.Put(context.Background(), bytes.NewReader(payload))
			if err != nil {
				t.Errorf("concurrent Put %d failed: %v", id, err)
				return
			}
			if err := store.Verify(info.Digest); err != nil {
				t.Errorf("concurrent Verify %d failed: %v", id, err)
			}
			p := filepath.Join("/ws", string(rune('a'+id)))
			mtime := time.Unix(1700000000, 0).UTC()
			tracker.Observe(p, int64(id), mtime)
			if !tracker.Observe(p, int64(id), mtime) {
				t.Errorf("expected second observe for %s to stabilize", p)
			}
		}(i)
	}
	wg.Wait()
}

func stringsRepeat(ch string, count int) string {
	b := make([]byte, count)
	for i := range b {
		b[i] = ch[0]
	}
	return string(b)
}
