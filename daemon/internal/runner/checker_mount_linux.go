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
// Writable exceptions, each justified in the change record:
//   - scratch, the only checker output
//   - a tmpfs on /tmp (and on TMPDIR when that is a different directory), so a
//     write never reaches the host temporary directory
//   - the CLI login-state directories (~/.claude or CLAUDE_CONFIG_DIR, ~/.codex
//     or CODEX_HOME) when they already exist, so a real-home login can refresh
//     its own session without the rest of HOME being writable
//   - /dev via --dev, so /dev/null and the tty devices work
//
// The deliverable tree is ro-bound at inputs/deliverables and again at its host
// path. A workspace or runtime that lives under a tmpfs path is ro-bound back
// after the tmpfs, then scratch is bound writable on top.
//
// When the command is a verified launch, Args[0] is /proc/self/fd/N. The
// descriptor is bind-mounted onto VerifiedPath, which the daemon passes in. The
// path is not read from /proc/self/fd, because that read can report " (deleted)".
func checkerMountArgv(cmd *exec.Cmd, ws *Workspace) ([]string, error) {
	bwrap, err := exec.LookPath("bwrap")
	if err != nil {
		return nil, fmt.Errorf("bubblewrap is not installed, so the checker cannot mount deliverables read-only and the check cannot count")
	}
	if cmd == nil || len(cmd.Args) == 0 || ws == nil {
		return nil, fmt.Errorf("the checker has no command to mount, so the check cannot count")
	}
	dest := filepath.Join(ws.Dir, "inputs", "deliverables")
	argv := append([]string{}, cmd.Args...)
	out := []string{bwrap, "--die-with-parent", "--ro-bind", "/", "/", "--dev", "/dev"}
	temps := tmpfsPaths()
	for _, t := range temps {
		out = append(out, "--tmpfs", t)
	}
	for _, p := range restoreUnderTmpfs(ws, temps) {
		out = append(out, "--ro-bind", p, p)
	}
	out = append(out, "--bind", ws.Scratch, ws.Scratch)
	for _, d := range loginStateDirs() {
		out = append(out, "--bind", d, d)
	}
	out = append(out, "--ro-bind", ws.Deliverables, dest)
	if filepath.Clean(ws.Deliverables) != filepath.Clean(dest) {
		out = append(out, "--ro-bind", ws.Deliverables, ws.Deliverables)
	}
	if fd, ok := procSelfFD(argv[0]); ok {
		if ws.VerifiedPath == "" {
			return nil, fmt.Errorf("the verified executable path is missing, so the check cannot count")
		}
		out = append(out, "--ro-bind-fd", fd, ws.VerifiedPath)
		argv[0] = ws.VerifiedPath
	}
	out = append(out, "--chdir", ws.Dir, "--")
	return append(out, argv...), nil
}

func tmpfsPaths() []string {
	out := []string{"/tmp"}
	t := os.Getenv("TMPDIR")
	if t == "" || !filepath.IsAbs(t) {
		return out
	}
	c, err := canonicalPath(t)
	if err != nil {
		return out
	}
	if c != "/tmp" && c != "/private/tmp" && filepath.Clean(t) != "/tmp" {
		out = append(out, t)
	}
	return out
}

// restoreUnderTmpfs lists directories that must stay visible and read-only after
// /tmp (or TMPDIR) is replaced with a tmpfs: the workspace or its parent, the
// deliverable tree, and the verified executable's directory.
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
