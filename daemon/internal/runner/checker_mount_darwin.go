//go:build darwin

package runner

import (
	"fmt"
	"os/exec"
	"path/filepath"
)

func checkerMountInPlace() bool { return true }

// checkerMountArgv runs the checker under Seatbelt. The profile denies file-write
// on inputs/deliverables and does not change HOME.
func checkerMountArgv(cmd *exec.Cmd, ws *Workspace) ([]string, error) {
	if cmd == nil || len(cmd.Args) == 0 {
		return nil, fmt.Errorf("the checker has no command to mount, so the check cannot count")
	}
	argv := cmd.Args
	bin, err := exec.LookPath("sandbox-exec")
	if err != nil {
		return nil, fmt.Errorf("Seatbelt (sandbox-exec) is not available, so the checker cannot deny writes to the deliverables and the check cannot count")
	}
	dest := filepath.Join(ws.Dir, "inputs", "deliverables")
	return append([]string{bin, "-p", seatbeltProfile(dest)}, argv...), nil
}
