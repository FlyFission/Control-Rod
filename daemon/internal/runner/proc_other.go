//go:build !unix

package runner

import "os/exec"

func setProcessGroup(*exec.Cmd) {}

// killProcessGroup kills the agent process. Child processes need job objects on Windows,
// which arrive with the Windows daemon in Phase 6.
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
}
