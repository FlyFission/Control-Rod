package gitworktree

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"time"
)

const (
	removeMaxAttempts = 5
	removeInitialWait = 25 * time.Millisecond
	removeMaxWait     = 400 * time.Millisecond
)

// RepairRemovePermissions walks root confined via Go 1.24 os.OpenRoot, skipping
// symlinks and adding owner rwx (perm|0o700) to directories and non-symlink files
// so subsequent removal can succeed on read-only (e.g. 0500) trees.
func RepairRemovePermissions(root string) error {
	if root == "" {
		return errors.New("gitworktree: empty path")
	}
	info, err := os.Lstat(root)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		// Never traverse or chmod through a symlink root.
		return nil
	}
	if !info.IsDir() {
		return nil
	}

	r, err := os.OpenRoot(root)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	defer r.Close()

	return repairRootRel(r, ".")
}

func repairRootRel(r *os.Root, rel string) error {
	info, err := r.Lstat(rel)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return nil
	}

	if !info.IsDir() {
		perm := info.Mode().Perm()
		if perm&0o700 == 0o700 {
			return nil
		}
		f, err := r.OpenFile(rel, os.O_RDONLY|syscallNoFollow, 0)
		if err != nil {
			// A 0000 regular file can still be unlinked once its parent directory is 0700.
			if errors.Is(err, fs.ErrPermission) || errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return err
		}
		cerr := f.Chmod(perm | 0o700)
		_ = f.Close()
		if cerr != nil && !errors.Is(cerr, fs.ErrNotExist) {
			return cerr
		}
		return nil
	}

	f, err := r.OpenFile(rel, os.O_RDONLY|syscallNoFollow, 0)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	perm := info.Mode().Perm()
	if perm&0o700 != 0o700 {
		if cerr := f.Chmod(perm | 0o700); cerr != nil {
			_ = f.Close()
			return cerr
		}
	}
	entries, err := f.ReadDir(-1)
	_ = f.Close()
	if err != nil {
		return err
	}
	for _, entry := range entries {
		if entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		child := entry.Name()
		if rel != "." {
			child = path.Join(rel, entry.Name())
		}
		if err := repairRootRel(r, child); err != nil {
			return err
		}
	}
	return nil
}

// RemoveAllWithRetry removes path with bounded context-aware backoff, repairing
// read-only permissions via os.OpenRoot when removal encounters permission errors.
func RemoveAllWithRetry(ctx context.Context, target string) error {
	if target == "" {
		return errors.New("gitworktree: empty removal path")
	}
	if err := ctx.Err(); err != nil {
		return err
	}

	backoff := removeInitialWait
	var lastErr error
	for attempt := 0; attempt < removeMaxAttempts; attempt++ {
		if err := ctx.Err(); err != nil {
			return err
		}
		err := os.RemoveAll(target)
		if err == nil {
			return nil
		}
		lastErr = err

		if repErr := RepairRemovePermissions(target); repErr == nil {
			if retryErr := os.RemoveAll(target); retryErr == nil {
				return nil
			} else {
				lastErr = retryErr
			}
		}

		if attempt == removeMaxAttempts-1 {
			break
		}
		timer := time.NewTimer(backoff)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
		backoff = min(backoff*2, removeMaxWait)
	}
	return fmt.Errorf("remove %s: %w", target, lastErr)
}
