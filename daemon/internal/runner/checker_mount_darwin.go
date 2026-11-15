//go:build darwin

package runner

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func checkerLinksDeliverables() bool { return false }

// checkerMountArgv runs the checker under Seatbelt. The profile denies every
// file write except the canonical scratch directory, a per-run directory under
// the canonical temporary directory (not all of /tmp), the credential file when
// it is a real file inside the login directory, and the disposable session
// directories. The real session directories are not writable, so a symlink
// such as sessions -> $HOME cannot grant writes to the home directory. Every
// path is canonicalized first so /tmp and /var match /private/tmp and
// /private/var. Deliverables live in the working directory as a real directory.
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
	runTmp, err := checkerRunTmp(ws)
	if err != nil {
		return nil, fmt.Errorf("cannot create the checker temporary directory (%v), so the check cannot count", err)
	}
	plan, err := planCheckerLogin(ws)
	if err != nil {
		return nil, err
	}
	extra, err := checkerSeatbeltPaths(plan)
	if err != nil {
		return nil, err
	}
	writable := append([]string{scratch, runTmp}, extra...)
	if _, err := canonicalPath(ws.Deliverables); err != nil {
		return nil, fmt.Errorf("cannot canonicalize the deliverable tree (%v), so the check cannot count", err)
	}
	setCheckerTmpEnv(cmd, runTmp)
	return append([]string{bin, "-p", seatbeltProfile(writable)}, cmd.Args...), nil
}

// checkerRunTmp is one directory for this run under the canonical temporary
// directory. It is not the whole of /tmp.
func checkerRunTmp(ws *Workspace) (string, error) {
	base, err := canonicalPath(os.TempDir())
	if err != nil {
		return "", err
	}
	dir := filepath.Join(base, "controlrod-checker-tmp", filepath.Base(ws.Dir))
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	return canonicalPath(dir)
}
