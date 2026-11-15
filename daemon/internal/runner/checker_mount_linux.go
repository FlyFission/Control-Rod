//go:build linux

package runner

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func checkerMountInPlace() bool { return false }

// checkerMountArgv runs the checker under bubblewrap with the deliverable tree
// read-only at inputs/deliverables. The rest of the filesystem, including the real
// HOME, stays as the process already sees it. HOME is not replaced.
//
// When the command is a verified launch, Args[0] is /proc/self/fd/N and that
// descriptor is an extra file. Bubblewrap would close it before the inner process,
// so the descriptor is bind-mounted read-only back onto its own path and the inner
// command is that path. The sandboxed child then executes the verified inode, which
// is what ConfirmSandbox checks. A staged Codex tree stays beside that path.
func checkerMountArgv(cmd *exec.Cmd, ws *Workspace) ([]string, error) {
	bwrap, err := exec.LookPath("bwrap")
	if err != nil {
		return nil, fmt.Errorf("bubblewrap is not installed, so the checker cannot mount deliverables read-only and the check cannot count")
	}
	if cmd == nil || len(cmd.Args) == 0 {
		return nil, fmt.Errorf("the checker has no command to mount, so the check cannot count")
	}
	dest := filepath.Join(ws.Dir, "inputs", "deliverables")
	argv := append([]string{}, cmd.Args...)
	out := []string{
		bwrap, "--die-with-parent",
		"--bind", "/", "/",
		"--ro-bind", ws.Deliverables, dest,
	}
	if fd, path, ok := verifiedBind(cmd); ok {
		out = append(out, "--ro-bind-fd", fd, path)
		argv[0] = path
	}
	out = append(out, "--chdir", ws.Dir, "--")
	return append(out, argv...), nil
}

// verifiedBind reports the extra-file number and the host path of a verified
// executable. The number is the child's fd (3, 4, ...), not the daemon's.
func verifiedBind(cmd *exec.Cmd) (fd, path string, ok bool) {
	fd, ok = procSelfFD(cmd.Args[0])
	if !ok || len(cmd.ExtraFiles) == 0 {
		return "", "", false
	}
	f := cmd.ExtraFiles[len(cmd.ExtraFiles)-1]
	link, err := os.Readlink(fmt.Sprintf("/proc/self/fd/%d", f.Fd()))
	if err != nil || link == "" || strings.HasPrefix(link, "/proc/") {
		return "", "", false
	}
	return fd, link, true
}

func procSelfFD(path string) (string, bool) {
	const prefix = "/proc/self/fd/"
	if !strings.HasPrefix(path, prefix) {
		return "", false
	}
	n := path[len(prefix):]
	if n == "" {
		return "", false
	}
	for _, c := range n {
		if c < '0' || c > '9' {
			return "", false
		}
	}
	return n, true
}
