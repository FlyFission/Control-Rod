//go:build !unix

package runner

import (
	"os/exec"
	"time"
)

func setProcessGroup(*exec.Cmd) {}

func processStart(int) (string, error) { return "", ErrNoIdentity }

func bootID() (string, error) { return "", ErrNoIdentity }

// StopTimings are the waits of the graceful stop ladder.
type StopTimings struct {
	AfterHangup time.Duration
	Grace       time.Duration
}

// StopGracefully cannot verify a process identity here, so it signals nothing; the caller falls
// back to killing the process it holds a handle to. Job objects arrive with the Windows daemon.
func StopGracefully(SpawnReceipt, StopTimings, <-chan struct{}) {}

// killProcessGroup kills the agent process. Child processes need job objects on Windows,
// which arrive with the Windows daemon in Phase 6.
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
