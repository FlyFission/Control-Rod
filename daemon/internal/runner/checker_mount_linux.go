//go:build linux

package runner

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func checkerLinksDeliverables() bool { return false }

// checkerMountArgv runs the checker under bubblewrap. The filesystem is read-only.
// --unshare-pid and --proc /proc replace the host /proc, so /proc/<host-pid>/root
// and /proc/<host-pid>/fd are not a path back to a writable host mount.
// Writable exceptions, each justified in the change record:
//   - scratch, the only checker output
//   - a tmpfs on /tmp, so a write never reaches the host temporary directory;
//     the child TMPDIR is /tmp inside that tmpfs
//   - the active CLI's credential file, when it already exists, and empty
//     session or log directories (see loginWritableFiles and loginWritableDirs)
//   - /dev via --dev, so /dev/null and the tty devices work
//
// After the tmpfs, the staged Codex tree (StageRoot) is read-only again, and so
// is any workspace that lived under /tmp. The deliverable directory is read-only.
// A verified launch's descriptor is mounted onto VerifiedPath. An empty
// VerifiedPath is left alone unless the command is already a /proc/self/fd path,
// which cannot be mounted and fails closed.
func checkerMountArgv(cmd *exec.Cmd, ws *Workspace) ([]string, error) {
	bwrap, err := exec.LookPath("bwrap")
	if err != nil {
		return nil, fmt.Errorf("bubblewrap is not installed, so the checker cannot mount deliverables read-only and the check cannot count")
	}
	if cmd == nil || len(cmd.Args) == 0 || ws == nil {
		return nil, fmt.Errorf("the checker has no command to mount, so the check cannot count")
	}
	argv := append([]string{}, cmd.Args...)
	out := []string{
		bwrap, "--die-with-parent", "--unshare-pid",
		"--ro-bind", "/", "/",
		"--proc", "/proc",
		"--dev", "/dev",
		"--tmpfs", "/tmp",
	}
	if st, err := os.Stat(StageRoot()); err == nil && st.IsDir() {
		out = append(out, "--ro-bind", StageRoot(), StageRoot())
	}
	for _, p := range restoreUnderTmpfs(ws, []string{"/tmp"}) {
		out = append(out, "--ro-bind", p, p)
	}
	out = append(out, "--bind", ws.Scratch, ws.Scratch)
	out = append(out, loginMounts(ws.CheckerRuntime)...)
	out = append(out, "--ro-bind", ws.Deliverables, ws.Deliverables)
	if fd, ok := procSelfFD(argv[0]); ok {
		if ws.VerifiedPath == "" {
			return nil, fmt.Errorf("the verified executable path is missing, so the check cannot count")
		}
		out = append(out, "--ro-bind-fd", fd, ws.VerifiedPath)
		argv[0] = ws.VerifiedPath
	}
	setCheckerTmpEnv(cmd, "/tmp")
	out = append(out, "--chdir", ws.Dir, "--")
	return append(out, argv...), nil
}

// loginMounts grants writes only inside the active runtime's login directory.
// Instruction and settings paths are then mounted read-only over that, when they exist.
func loginMounts(runtime string) []string {
	root := loginRoot(runtime)
	if root == "" {
		return nil
	}
	var out []string
	for _, rel := range loginWritableFiles(runtime) {
		p := filepath.Join(root, rel)
		if st, err := os.Lstat(p); err == nil && st.Mode().IsRegular() {
			out = append(out, "--bind", p, p)
		}
	}
	for _, rel := range loginWritableDirs(runtime) {
		p := filepath.Join(root, rel)
		if st, err := os.Lstat(p); err == nil && st.IsDir() {
			out = append(out, "--bind", p, p)
		} else if err != nil && os.IsNotExist(err) {
			out = append(out, "--dir", p)
		}
	}
	for _, name := range protectedLoginNames {
		p := filepath.Join(root, name)
		if _, err := os.Lstat(p); err == nil {
			out = append(out, "--ro-bind", p, p)
		}
	}
	return out
}

// restoreUnderTmpfs lists directories that must stay visible and read-only after
// /tmp is replaced with a tmpfs: the workspace or its parent, the deliverable
// tree, and the verified executable's directory. The staged Codex tree is
// restored separately as StageRoot.
func restoreUnderTmpfs(ws *Workspace, temps []string) []string {
	var out []string
	add := func(p string) {
		p = filepath.Clean(p)
		if p == "" || p == "/" || !coveredBy(p, temps) || isTmpfsRoot(p, temps) {
			return
		}
		for _, have := range out {
			if have == p || strings.HasPrefix(p, have+string(os.PathSeparator)) {
				return
			}
		}
		out = append(out, p)
	}
	parent := filepath.Dir(ws.Dir)
	if coveredBy(parent, temps) && !isTmpfsRoot(parent, temps) {
		add(parent)
	} else {
		add(ws.Dir)
	}
	add(ws.Deliverables)
	if ws.VerifiedPath != "" {
		add(filepath.Dir(ws.VerifiedPath))
	}
	return out
}

// tmpfsPaths remains for tests that still name the temporary roots. The mount
// itself always uses /tmp; the child's TMPDIR is set to that private tmpfs.
func tmpfsPaths() []string { return []string{"/tmp"} }

func coveredBy(path string, roots []string) bool {
	path = filepath.Clean(path)
	for _, r := range roots {
		r = filepath.Clean(r)
		if path == r || strings.HasPrefix(path, r+string(os.PathSeparator)) {
			return true
		}
	}
	return false
}

func isTmpfsRoot(path string, roots []string) bool {
	path = filepath.Clean(path)
	for _, r := range roots {
		if filepath.Clean(r) == path {
			return true
		}
	}
	return false
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
