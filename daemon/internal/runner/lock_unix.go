//go:build unix

package runner

import (
	"fmt"
	"os"
	"path/filepath"
	"syscall"
)

// LockHome takes the home's daemon lock, so only one daemon at a time owns its receipts and its
// run scopes. The lock is released when the returned function runs or the process exits.
func LockHome(home string) (func(), error) {
	if err := os.MkdirAll(home, 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(home, "daemon.lock"), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("another Control Rod daemon is already running with home %s; stop it first", home)
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}
