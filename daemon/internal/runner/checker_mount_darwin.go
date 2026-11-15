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
// the canonical temporary directory (not all of /tmp), and the active CLI's
// credential file plus its session and log directories. Every path is
// canonicalized first so /tmp and /var match /private/tmp and /private/var.
// Deliverables live in the working directory as a real directory, so reads do
// not depend on a symlink.
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
	writable := []string{scratch, runTmp}
	root := loginRoot(ws.CheckerRuntime)
	if root != "" {
		for _, rel := range loginWritableFiles(ws.CheckerRuntime) {
			p := filepath.Join(root, rel)
			if st, err := os.Lstat(p); err == nil && st.Mode().IsRegular() {
				c, err := canonicalPath(p)
				if err != nil {
					return nil, err
				}
				writable = append(writable, c)
			}
		}
		for _, rel := range loginWritableDirs(ws.CheckerRuntime) {
			p := filepath.Join(root, rel)
			if err := os.MkdirAll(p, 0o700); err != nil {
				return nil, err
			}
			c, err := canonicalPath(p)
			if err != nil {
				return nil, err
			}
			writable = append(writable, c)
		}
	}
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
