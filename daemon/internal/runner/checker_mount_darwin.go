//go:build darwin

package runner

import (
	"fmt"
	"os/exec"
)

func checkerLinksDeliverables() bool { return true }

// checkerMountArgv runs the checker under Seatbelt. The profile denies every
// file write except the canonical scratch directory and the CLI login-state
// directories. Every path is canonicalized first so /tmp and /var match
// /private/tmp and /private/var.
func checkerMountArgv(cmd *exec.Cmd, ws *Workspace) ([]string, error) {
	if cmd == nil || len(cmd.Args) == 0 || ws == nil {
		return nil, fmt.Errorf("the checker has no command to mount, so the check cannot count")
	}
	bin, err := exec.LookPath("sandbox-exec")
	if err != nil {
		return nil, fmt.Errorf("Seatbelt (sandbox-exec) is not available, so the checker cannot deny writes outside scratch and the check cannot count")
	}
	scratch, err := canonicalPath(ws.Scratch)
	if err != nil {
		return nil, fmt.Errorf("cannot canonicalize the scratch directory (%v), so the check cannot count", err)
	}
	writable := []string{scratch}
	for _, d := range loginStateDirs() {
		c, err := canonicalPath(d)
		if err != nil {
			return nil, fmt.Errorf("cannot canonicalize %s (%v), so the check cannot count", d, err)
		}
		writable = append(writable, c)
	}
	if _, err := canonicalPath(ws.Deliverables); err != nil {
		return nil, fmt.Errorf("cannot canonicalize the deliverable tree (%v), so the check cannot count", err)
	}
	return append([]string{bin, "-p", seatbeltProfile(writable)}, cmd.Args...), nil
}
