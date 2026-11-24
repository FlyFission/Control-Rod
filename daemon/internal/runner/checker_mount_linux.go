//go:build linux

package runner

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
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
//   - the active CLI's credential file, when it is a regular file inside the
//     login directory, its disposable login state, and empty per-run
//     directories mounted over the real session directories (planCheckerLogin)
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
	if err := bwrapHasSeccomp(bwrap); err != nil {
		return nil, err
	}
	filter, err := seccompFilterFile()
	if err != nil {
		return nil, err
	}
	if ws.Seccomp != nil {
		ws.Seccomp.Close()
	}
	ws.Seccomp = filter
	cmd.ExtraFiles = append(cmd.ExtraFiles, filter)
	seccompFD := 2 + len(cmd.ExtraFiles)
	argv := append([]string{}, cmd.Args...)
	out := []string{
		bwrap, "--die-with-parent", "--unshare-pid", "--unshare-ipc",
		"--seccomp", strconv.Itoa(seccompFD),
		"--ro-bind", "/", "/",
		"--proc", "/proc",
		"--dev", "/dev",
		"--tmpfs", "/tmp",
	}
	out = append(out, hideHostSockets(cmd, ws)...)
	if st, err := os.Stat(StageRoot()); err == nil && st.IsDir() {
		out = append(out, "--ro-bind", StageRoot(), StageRoot())
	}
	for _, p := range restoreUnderTmpfs(ws, []string{"/tmp"}) {
		out = append(out, "--ro-bind", p, p)
	}
	files, evidence, err := checkerWriteTargets(ws)
	if err != nil {
		return nil, err
	}
	if ws.Scratch != "" && isolatedLoginHomeEnv(ws.CheckerRuntime) != "" {
		// Shadow scratch with an ephemeral tmpfs so nested sandboxes (e.g. Codex's linux-sandbox)
		// can create synthetic mount-points under scratch while only the three explicit checker
		// targets below ever reach the host filesystem.
		out = append(out, "--tmpfs", ws.Scratch)
	}
	for _, p := range files {
		out = append(out, "--bind", p, p)
	}
	out = append(out, "--bind", evidence, evidence)
	login, err := planCheckerLogin(ws)
	if err != nil {
		return nil, err
	}
	out = append(out, loginMounts(login)...)
	if envName := isolatedLoginHomeEnv(ws.CheckerRuntime); envName != "" && login.Root != "" {
		isoMounts, err := mountIsolatedLoginHome(cmd, ws, login, envName)
		if err != nil {
			return nil, err
		}
		out = append(out, isoMounts...)
	}
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

// hideHostSockets covers host Unix sockets the checker could connect() to
// through the read-only root. Network stays available: the CLIs need HTTPS.
// --unshare-ipc does not hide filesystem sockets. A tmpfs replaces a runtime
// directory. A socket file is replaced with /dev/null. Paths already under a
// tmpfs are left alone, because mounting onto a path the tmpfs removed fails.
func hideHostSockets(cmd *exec.Cmd, ws *Workspace) []string {
	var dirs []string
	if d := filepath.Join("/run/user", strconv.Itoa(os.Getuid())); realDir(d) {
		dirs = append(dirs, d)
	}
	if xdg := envAny(cmd, "XDG_RUNTIME_DIR"); realDir(xdg) && !coveredBy(xdg, dirs) && !coveredBy(xdg, []string{"/tmp"}) {
		dirs = append(dirs, xdg)
	}
	if d := "/run/dbus"; realDir(d) {
		dirs = append(dirs, d)
	}
	var out []string
	var covered []string
	for _, d := range dirs {
		if skipSocketHide(ws, d) {
			continue
		}
		out = append(out, "--tmpfs", d)
		covered = append(covered, d)
	}
	var sockets []string
	for _, p := range []string{"/run/docker.sock", "/var/run/docker.sock", "/run/dbus/system_bus_socket", "/var/run/dbus/system_bus_socket"} {
		sockets = append(sockets, p)
	}
	sockets = append(sockets, envAll(cmd, "SSH_AUTH_SOCK")...)
	for _, home := range gpgHomes(cmd) {
		for _, name := range []string{"S.gpg-agent", "S.gpg-agent.extra", "S.gpg-agent.ssh", "S.gpg-agent.browser"} {
			sockets = append(sockets, filepath.Join(home, name))
		}
	}
	tried := map[string]bool{}
	seen := map[string]bool{}
	for _, p := range sockets {
		p = filepath.Clean(p)
		if p == "" || p == "." || tried[p] || !filepath.IsAbs(p) {
			continue
		}
		tried[p] = true
		for _, target := range socketMaskTargets(p) {
			if seen[target] || coveredBy(target, covered) || coveredBy(target, []string{"/tmp"}) {
				continue
			}
			seen[target] = true
			if skipSocketHide(ws, target) {
				continue
			}
			out = append(out, "--ro-bind", "/dev/null", target)
		}
	}
	return out
}

// socketMaskTargets is the path bubblewrap can mount onto, plus the
// EvalSymlinks target when the path or one of its parents is a symlink.
// /var/run is a symlink to /run on many hosts; mounting onto
// /var/run/docker.sock then fails with "No such file or directory". The
// real socket is masked instead, and a symlink socket is masked at both
// ends.
func socketMaskTargets(path string) []string {
	path = filepath.Clean(path)
	if path == "" || path == "/" || path == "/dev/null" || !filepath.IsAbs(path) {
		return nil
	}
	st, err := os.Lstat(path)
	if err != nil {
		return nil
	}
	if st.Mode()&os.ModeSocket == 0 && st.Mode()&os.ModeSymlink == 0 {
		return nil
	}
	var out []string
	add := func(p string) {
		p = filepath.Clean(p)
		if p == "" || p == "/" || p == "/dev/null" || !parentsAreReal(p) {
			return
		}
		for _, have := range out {
			if have == p {
				return
			}
		}
		tst, err := os.Lstat(p)
		if err != nil || (tst.Mode()&os.ModeSocket == 0 && tst.Mode()&os.ModeSymlink == 0) {
			return
		}
		out = append(out, p)
	}
	add(path)
	if !parentsAreReal(path) || st.Mode()&os.ModeSymlink != 0 {
		if target, err := filepath.EvalSymlinks(path); err == nil {
			add(target)
		}
	}
	return out
}

func parentsAreReal(path string) bool {
	dir := filepath.Dir(filepath.Clean(path))
	for dir != "/" && dir != "." {
		st, err := os.Lstat(dir)
		if err != nil || !st.IsDir() || st.Mode()&os.ModeSymlink != 0 {
			return false
		}
		next := filepath.Dir(dir)
		if next == dir {
			break
		}
		dir = next
	}
	return true
}

func realDir(path string) bool {
	st, err := os.Lstat(path)
	return err == nil && st.IsDir() && st.Mode()&os.ModeSymlink == 0
}

func skipSocketHide(ws *Workspace, path string) bool {
	if ws == nil || path == "" || path == "/" {
		return path == "/"
	}
	for _, keep := range []string{ws.Dir, ws.Scratch, ws.Deliverables, StageRoot()} {
		if keep != "" && (path == keep || strings.HasPrefix(path, keep+string(os.PathSeparator)) || strings.HasPrefix(keep, path+string(os.PathSeparator))) {
			return true
		}
	}
	return false
}

func envAny(cmd *exec.Cmd, key string) string {
	vals := envAll(cmd, key)
	if len(vals) == 0 {
		return ""
	}
	return vals[0]
}

func envAll(cmd *exec.Cmd, key string) []string {
	var out []string
	add := func(v string) {
		if v == "" {
			return
		}
		for _, have := range out {
			if have == v {
				return
			}
		}
		out = append(out, v)
	}
	if cmd != nil && cmd.Env != nil {
		for _, kv := range cmd.Env {
			k, v, ok := strings.Cut(kv, "=")
			if ok && k == key {
				add(v)
			}
		}
	}
	add(os.Getenv(key))
	return out
}

func gpgHomes(cmd *exec.Cmd) []string {
	var out []string
	if v := envAny(cmd, "GNUPGHOME"); v != "" {
		out = append(out, v)
	}
	if v := os.Getenv("GNUPGHOME"); v != "" && (len(out) == 0 || out[0] != v) {
		out = append(out, v)
	}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		out = append(out, filepath.Join(home, ".gnupg"))
	}
	return out
}

// loginMounts keeps the real login directory read-only, including when it lives
// under /tmp and the tmpfs would otherwise hide it or expose a writable copy.
// The credential file is then bound writable, as on main: an OAuth refresh during
// a check must be saved, and with token rotation only the host file can keep the
// replacement. Each real session directory is covered by an empty per-run
// directory. Missing session directories are not created on the host. A symlink
// is not a mount point.
func loginMounts(plan loginPlan) []string {
	if plan.Root == "" {
		return nil
	}
	st, err := os.Lstat(plan.Root)
	if err != nil || st.Mode()&os.ModeSymlink != 0 || !st.IsDir() {
		return nil
	}
	out := []string{"--ro-bind", plan.Root, plan.Root}
	if plan.Credential != "" {
		out = append(out, "--bind", plan.Credential, plan.Credential)
	}
	for _, o := range plan.Overlays {
		out = append(out, "--bind", o.Host, o.Dest)
	}
	return out
}

// mountIsolatedLoginHome creates a per-run writable directory under the checker's disposable
// login parent, binds the verified credential file inside it writable (as loginMounts does), and
// points envName (e.g. CODEX_HOME) at it so the CLI's ephemeral app-server/SQLite state works and a
// refreshed sign-in reaches the host, while the rest of the host login directory stays read-only.
func mountIsolatedLoginHome(cmd *exec.Cmd, ws *Workspace, plan loginPlan, envName string) ([]string, error) {
	base := ws.LoginDisposable
	if base == "" {
		var err error
		base, err = os.MkdirTemp(filepath.Dir(ws.Dir), "login-overlay-")
		if err != nil {
			return nil, err
		}
		ws.LoginDisposable = base
	}
	homeDir := filepath.Join(base, "isolated-home")
	if err := os.MkdirAll(homeDir, 0o700); err != nil {
		return nil, err
	}
	out := []string{"--bind", homeDir, homeDir}
	if plan.Credential != "" {
		// The host credential itself, writable, as loginMounts binds it: a CLI must save a sign-in
		// it refreshes mid-check (Codex aborts the check otherwise), and with token rotation only
		// the host file can keep the replacement. This is main's custody, unchanged; narrowing it
		// is a separate decision (see evidence/landing-review.md, L3).
		dest := filepath.Join(homeDir, filepath.Base(plan.Credential))
		if err := os.WriteFile(dest, nil, 0o600); err != nil {
			return nil, err
		}
		out = append(out, "--bind", plan.Credential, dest)
	}
	prefix := envName + "="
	filtered := make([]string, 0, len(cmd.Env)+1)
	for _, kv := range cmd.Env {
		if !strings.HasPrefix(kv, prefix) {
			filtered = append(filtered, kv)
		}
	}
	cmd.Env = append(filtered, prefix+homeDir)
	return out, nil
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
