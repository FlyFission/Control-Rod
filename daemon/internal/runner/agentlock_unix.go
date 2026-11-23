//go:build unix

package runner

import (
	"errors"
	"os"
	"syscall"
)

// ErrAgentsInUse means another process holds the agent install lock: a run is using an agent CLI,
// or another update is installing one.
var ErrAgentsInUse = errors.New("an agent CLI is in use by a run or another update")

// LockAgentsShared is taken by each run for its whole length, so no install (which takes the lock
// exclusively) replaces a CLI under it. It waits while an install holds the lock.
func LockAgentsShared(path string) (func(), error) { return flockPath(path, syscall.LOCK_SH) }

// TryLockAgentsExclusive is taken around an install, by the daemon or by `controlrod agents
// update`. It does not wait: ErrAgentsInUse while any run (of any daemon on this host using the same
// npm) or another install holds the lock.
func TryLockAgentsExclusive(path string) (func(), error) {
	release, err := flockPath(path, syscall.LOCK_EX|syscall.LOCK_NB)
	if errors.Is(err, syscall.EWOULDBLOCK) {
		return nil, ErrAgentsInUse
	}
	return release, err
}

func flockPath(path string, how int) (func(), error) {
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o644)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), how); err != nil {
		f.Close()
		return nil, err
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}
