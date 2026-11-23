//go:build !unix

package runner

import (
	"errors"
	"os/exec"
	"time"
)

var errNotRunning = errors.New("process has exited")

func setProcessGroup(*exec.Cmd) {}

func processStart(int) (string, error) { return "", ErrNoIdentity }

func bootID() (string, error) { return "", ErrNoIdentity }

// StopTimings are the waits of the graceful stop ladder.
type StopTimings struct {
	AfterHangup time.Duration
	Grace       time.Duration
}

// Alive cannot be known here without a process identity.
func (r SpawnReceipt) Alive() bool { return false }

// StopGracefully cannot verify a process identity here, so it signals nothing; the caller kills
// the process it holds a handle to. Job objects arrive with the Windows daemon.
func StopGracefully(_ SpawnReceipt, _ StopTimings, snapshot func()) bool {
	if snapshot != nil {
		snapshot()
	}
	return false
}

// killProcessGroup kills the agent process. Child processes need job objects on Windows,
// which arrive with the Windows daemon in Phase 6.
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}

func processExists(int) bool { return false }

// Pinned is a no-op here.
func (r SpawnReceipt) Pinned() SpawnReceipt { return r }
