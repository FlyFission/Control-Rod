//go:build unix

package runner

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	lockRetryInitial = 10 * time.Millisecond
	lockRetryMax     = 100 * time.Millisecond
)

// flockHomeFn is the flock syscall entrypoint used by LockHomeWithWait; tests may
// override it to verify fail-closed handling on ErrUnsupported / EOPNOTSUPP.
var flockHomeFn = syscall.Flock

// LockHome takes the home's daemon lock without waiting, so only one daemon at a time owns its
// receipts and its run scopes. The lock is released when the returned function runs or the process
// exits.
func LockHome(home string) (func(), error) {
	f, err := LockHomeWithWait(context.Background(), home, 0)
	if err != nil {
		return nil, err
	}
	return func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		_ = f.Close()
	}, nil
}

// LockHomeWithWait acquires the exclusive daemon home lock at <home>/daemon.lock, retrying
// boundedly on contention up to wait. The file is opened with O_RDWR|O_CREATE (never O_TRUNC) so a
// contending caller does not erase the holder's PID before winning the flock. Once locked, the
// current PID is written to the file. On contention timeout, the error names any recorded holder
// PID. Unlike unlocked fallbacks, if the filesystem returns ErrUnsupported/EOPNOTSUPP/ENOSYS,
// LockHomeWithWait fails closed.
func LockHomeWithWait(ctx context.Context, home string, wait time.Duration) (*os.File, error) {
	if err := os.MkdirAll(home, 0o700); err != nil {
		return nil, err
	}
	lockPath := filepath.Join(home, "daemon.lock")
	f, err := os.OpenFile(lockPath, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}

	var deadline time.Time
	if wait > 0 {
		deadline = time.Now().Add(wait)
	}
	backoff := lockRetryInitial

	for {
		err := flockHomeFn(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB)
		if err == nil {
			if werr := writeHolderPID(f, os.Getpid()); werr != nil {
				_ = flockHomeFn(int(f.Fd()), syscall.LOCK_UN)
				_ = f.Close()
				return nil, werr
			}
			return f, nil
		}

		if isFlockUnsupported(err) {
			_ = f.Close()
			return nil, fmt.Errorf("daemon lock unsupported on %s: %w", home, errors.Join(errors.ErrUnsupported, err))
		}
		if !isFlockContention(err) {
			_ = f.Close()
			return nil, err
		}

		now := time.Now()
		if wait <= 0 || !now.Before(deadline) {
			holder := readHolderPID(f)
			_ = f.Close()
			if holder > 0 {
				return nil, fmt.Errorf("another Control Rod daemon (pid %d) is already running with home %s; stop it first", holder, home)
			}
			return nil, fmt.Errorf("another Control Rod daemon is already running with home %s; stop it first", home)
		}

		sleepFor := backoff
		if rem := deadline.Sub(now); rem < sleepFor {
			sleepFor = rem
		}
		timer := time.NewTimer(sleepFor)
		select {
		case <-ctx.Done():
			timer.Stop()
			holder := readHolderPID(f)
			_ = f.Close()
			if holder > 0 {
				return nil, fmt.Errorf("waiting for daemon lock on %s (held by pid %d): %w", home, holder, ctx.Err())
			}
			return nil, fmt.Errorf("waiting for daemon lock on %s: %w", home, ctx.Err())
		case <-timer.C:
		}
		backoff = min(backoff*2, lockRetryMax)
	}
}

func isFlockContention(err error) bool {
	return errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN)
}

func isFlockUnsupported(err error) bool {
	return errors.Is(err, errors.ErrUnsupported) ||
		errors.Is(err, syscall.EOPNOTSUPP) ||
		errors.Is(err, syscall.ENOTSUP) ||
		errors.Is(err, syscall.ENOSYS) ||
		errors.Is(err, syscall.ENOLCK)
}

func writeHolderPID(f *os.File, pid int) error {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if err := f.Truncate(0); err != nil {
		return err
	}
	_, err := fmt.Fprintf(f, "%d\n", pid)
	return err
}

func readHolderPID(f *os.File) int {
	var buf [64]byte
	n, err := f.ReadAt(buf[:], 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return 0
	}
	s := strings.TrimSpace(string(buf[:n]))
	if s == "" {
		return 0
	}
	pid, err := strconv.Atoi(s)
	if err != nil || pid <= 0 {
		return 0
	}
	return pid
}

// lockFile takes an exclusive lock on path, waiting for any other holder, and returns its release.
func lockFile(path string) (func(), error) {
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, err
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}
