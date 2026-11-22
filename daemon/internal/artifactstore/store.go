// Package artifactstore provides an os.OpenRoot-confined content-addressed blob
// store and a two-poll (size, mtime) stability tracker for outside workspaces.
package artifactstore

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sync"
	"syscall"
)

const (
	// DefaultMaxBytes is the default per-blob byte limit when Options.MaxBytes <= 0.
	DefaultMaxBytes int64 = 50 << 20 // 50 MiB

	blobsDir = "blobs"
	tmpDir   = "tmp"
)

var (
	// ErrTooLarge indicates a streamed payload exceeded MaxBytes.
	ErrTooLarge = errors.New("artifactstore: blob exceeds max byte limit")

	// ErrInvalidDigest indicates a malformed SHA-256 digest key.
	ErrInvalidDigest = errors.New("artifactstore: invalid sha256 digest")

	// ErrSymlinkRefused indicates a symlink was encountered inside the confined root.
	ErrSymlinkRefused = errors.New("artifactstore: symlink refused")

	// ErrNotFound indicates the requested blob does not exist.
	ErrNotFound = errors.New("artifactstore: blob not found")

	// ErrDigestMismatch indicates on-disk blob contents failed SHA-256 verification.
	ErrDigestMismatch = errors.New("artifactstore: blob digest mismatch")
)

// Options configures an artifact Store.
type Options struct {
	// MaxBytes is the maximum accepted blob size in bytes. Defaults to DefaultMaxBytes when <= 0.
	MaxBytes int64
}

// BlobInfo describes a stored content-addressed blob.
type BlobInfo struct {
	Digest         string
	Size           int64
	RelPath        string
	AlreadyExisted bool
}

// Store is an os.OpenRoot-confined content-addressed blob store.
type Store struct {
	mu       sync.Mutex
	root     *os.Root
	maxBytes int64
	closed   bool
}

// Open opens (or initializes) a confined blob store at dir.
func Open(dir string, opts Options) (*Store, error) {
	if dir == "" {
		return nil, errors.New("artifactstore: dir is required")
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(absDir, 0o700); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(absDir)
	if err != nil {
		return nil, err
	}
	for _, sub := range []string{blobsDir, tmpDir} {
		if err := ensureDir(root, sub); err != nil {
			_ = root.Close()
			return nil, err
		}
	}
	maxBytes := opts.MaxBytes
	if maxBytes <= 0 {
		maxBytes = DefaultMaxBytes
	}
	return &Store{root: root, maxBytes: maxBytes}, nil
}

// Close closes the underlying os.Root handle.
func (s *Store) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return nil
	}
	s.closed = true
	return s.root.Close()
}

// ValidDigest reports whether digest is a 64-character lowercase hex SHA-256 string.
func ValidDigest(digest string) bool {
	if len(digest) != sha256.Size*2 {
		return false
	}
	for i := 0; i < len(digest); i++ {
		c := digest[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return false
		}
	}
	return true
}

func ensureDir(root *os.Root, rel string) error {
	if err := root.Mkdir(rel, 0o700); err != nil && !errors.Is(err, fs.ErrExist) {
		return err
	}
	info, err := root.Lstat(rel)
	if err != nil {
		return err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return fmt.Errorf("%w: %s", ErrSymlinkRefused, rel)
	}
	if !info.IsDir() {
		return fmt.Errorf("artifactstore: %s is not a directory", rel)
	}
	return nil
}

func randomHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// Put streams r through sha256 and a temporary file confined to the store root
// using io.MultiWriter and io.LimitReader(maxBytes+1), then atomically renames
// the temporary file into its content-addressed slot so hashed bytes == stored bytes.
func (s *Store) Put(ctx context.Context, r io.Reader) (BlobInfo, error) {
	if err := ctx.Err(); err != nil {
		return BlobInfo{}, err
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return BlobInfo{}, fs.ErrClosed
	}
	root := s.root
	maxBytes := s.maxBytes
	s.mu.Unlock()

	if err := ensureDir(root, tmpDir); err != nil {
		return BlobInfo{}, err
	}
	if err := ensureDir(root, blobsDir); err != nil {
		return BlobInfo{}, err
	}

	suffix, err := randomHex(12)
	if err != nil {
		return BlobInfo{}, err
	}
	tmpName := "put-" + suffix + ".tmp"
	tmpRel := path.Join(tmpDir, tmpName)
	f, err := root.OpenFile(tmpRel, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return BlobInfo{}, err
	}

	cleanupTmp := func() {
		_ = root.Remove(tmpRel)
	}

	h := sha256.New()
	n, copyErr := io.Copy(io.MultiWriter(h, f), io.LimitReader(r, maxBytes+1))
	if copyErr != nil {
		_ = f.Close()
		cleanupTmp()
		return BlobInfo{}, copyErr
	}
	if err := ctx.Err(); err != nil {
		_ = f.Close()
		cleanupTmp()
		return BlobInfo{}, err
	}
	if n > maxBytes {
		_ = f.Close()
		cleanupTmp()
		return BlobInfo{}, fmt.Errorf("%w: limit %d bytes", ErrTooLarge, maxBytes)
	}
	if err := errors.Join(f.Sync(), f.Close()); err != nil {
		cleanupTmp()
		return BlobInfo{}, err
	}

	digest := hex.EncodeToString(h.Sum(nil))
	shardRel := path.Join(blobsDir, digest[:2])
	if err := ensureDir(root, shardRel); err != nil {
		cleanupTmp()
		return BlobInfo{}, err
	}
	blobRel := path.Join(shardRel, digest)

	alreadyExisted := false
	if info, err := root.Lstat(blobRel); err == nil {
		if info.Mode()&fs.ModeSymlink != 0 {
			cleanupTmp()
			return BlobInfo{}, fmt.Errorf("%w: %s", ErrSymlinkRefused, blobRel)
		}
		alreadyExisted = true
	} else if !errors.Is(err, fs.ErrNotExist) {
		cleanupTmp()
		return BlobInfo{}, err
	}

	if err := renameWithinRoot(root, tmpDir, tmpName, shardRel, digest); err != nil {
		cleanupTmp()
		return BlobInfo{}, err
	}

	return BlobInfo{
		Digest:         digest,
		Size:           n,
		RelPath:        blobRel,
		AlreadyExisted: alreadyExisted,
	}, nil
}

// Get opens the stored blob for digest, confined strictly to the store root
// and refusing symlinks or special files.
func (s *Store) Get(digest string) (*os.File, int64, error) {
	if !ValidDigest(digest) {
		return nil, 0, fmt.Errorf("%w: %q", ErrInvalidDigest, digest)
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return nil, 0, fs.ErrClosed
	}
	root := s.root
	s.mu.Unlock()

	shardRel := path.Join(blobsDir, digest[:2])
	blobRel := path.Join(shardRel, digest)
	for _, rel := range []string{blobsDir, shardRel, blobRel} {
		info, err := root.Lstat(rel)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil, 0, fmt.Errorf("%w: %s", ErrNotFound, digest)
			}
			return nil, 0, err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return nil, 0, fmt.Errorf("%w: %s", ErrSymlinkRefused, rel)
		}
	}

	f, err := root.OpenFile(blobRel, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, 0, fmt.Errorf("%w: %s", ErrNotFound, digest)
		}
		return nil, 0, err
	}
	info, err := f.Stat()
	if err != nil {
		_ = f.Close()
		return nil, 0, err
	}
	if !info.Mode().IsRegular() {
		_ = f.Close()
		return nil, 0, fmt.Errorf("%w: %s is not a regular file", ErrSymlinkRefused, blobRel)
	}
	return f, info.Size(), nil
}

// ReadBytes reads the full stored blob for digest into memory, verifying its size
// does not exceed the store's MaxBytes cap.
func (s *Store) ReadBytes(digest string) ([]byte, error) {
	f, _, err := s.Get(digest)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, s.maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > s.maxBytes {
		return nil, ErrTooLarge
	}
	return data, nil
}

// Has reports whether a valid regular blob for digest exists in the store.
func (s *Store) Has(digest string) bool {
	if !ValidDigest(digest) {
		return false
	}
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return false
	}
	root := s.root
	s.mu.Unlock()

	blobRel := path.Join(blobsDir, digest[:2], digest)
	info, err := root.Lstat(blobRel)
	return err == nil && info.Mode().IsRegular()
}

// Verify streams the stored blob through SHA-256 and checks that it matches digest.
func (s *Store) Verify(digest string) error {
	f, _, err := s.Get(digest)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	got := hex.EncodeToString(h.Sum(nil))
	if got != digest {
		return fmt.Errorf("%w: got %s want %s", ErrDigestMismatch, got, digest)
	}
	return nil
}
