//go:build !linux && !darwin

package runner

import (
	"fmt"
	"os/exec"
)

func checkerMountInPlace() bool { return false }

func checkerMountArgv(_ *exec.Cmd, _ *Workspace) ([]string, error) {
	return nil, fmt.Errorf("this platform has no read-only mount for checker deliverables, so the check cannot count")
}
