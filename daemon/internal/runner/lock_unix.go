//go:build unix

package runner

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

// LockHome takes the home's daemon lock, so only one daemon at a time owns its receipts and its
// run scopes. The lock is released when the returned function runs or the process exits.
//
// The holder writes its PID into daemon.lock after it wins the lock, and a second daemon names that
// PID when it refuses to start, so "already running" says which process to stop. The file is
// opened without O_TRUNC, so a daemon that loses never erases the holder's PID. A filesystem that
// cannot lock fails closed: two daemons on one home would share receipts.
func LockHome(home string) (func(), error) {
	if err := os.MkdirAll(home, 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(home, "daemon.lock"), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	if err := flockHome(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		holder := readHolderPID(f)
		f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			if holder > 0 {
				return nil, fmt.Errorf("another Control Rod daemon (pid %d) is already running with home %s; stop it first", holder, home)
			}
			return nil, fmt.Errorf("another Control Rod daemon is already running with home %s; stop it first", home)
		}
		return nil, fmt.Errorf("cannot lock the daemon home %s, so Control Rod will not start (two daemons would share its receipts): %w", home, err)
	}
	if err := writeHolderPID(f, os.Getpid()); err != nil {
		_ = flockHome(int(f.Fd()), syscall.LOCK_UN)
		f.Close()
		return nil, fmt.Errorf("record the daemon PID in %s: %w", f.Name(), err)
	}
	return func() { _ = flockHome(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}

// flockHome is syscall.Flock; tests replace it to reach the unsupported-filesystem path.
var flockHome = syscall.Flock

// writeHolderPID replaces the file's content with pid. It runs only while the lock is held.
func writeHolderPID(f *os.File, pid int) error {
	if err := f.Truncate(0); err != nil {
		return err
	}
	_, err := f.WriteAt([]byte(strconv.Itoa(pid)+"\n"), 0)
	return err
}

// readHolderPID returns the PID recorded by the lock's holder, or 0 when none is readable.
func readHolderPID(f *os.File) int {
	var buf [32]byte
	n, err := f.ReadAt(buf[:], 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return 0
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(buf[:n])))
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
