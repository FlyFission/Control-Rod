//go:build linux

package runner

import (
	"encoding/base64"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func copyRegularFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

func TestVerifiedRuntimeMayBeAGrandchild(t *testing.T) {
	cmd := exec.Command("/bin/sh", "-c", "sh -c 'sleep 30'")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	f, err := os.Open("/bin/sleep")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if childRuns(cmd.Process.Pid, st) {
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the verified executable was not found below the outer process")
}

func TestCheckerMountFailsClosedWithoutBubblewrap(t *testing.T) {
	t.Setenv("PATH", t.TempDir())
	ws, _ := prepareCheckerFixture(t)
	cmd := exec.Command("claude", "-p", CheckerPrompt)
	_, err := checkerMountArgv(cmd, ws)
	if err == nil || !strings.Contains(err.Error(), "cannot count") {
		t.Fatalf("missing bubblewrap: %v", err)
	}
}

func TestBubblewrapMountsDeliverablesReadOnly(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal("bubblewrap is not installed; the read-only mount was not run")
	}
	ws, _ := prepareCheckerFixture(t)
	before, err := TreeDigest(ws.Deliverables)
	if err != nil {
		t.Fatal(err)
	}
	script := "echo tampered >> inputs/deliverables/report.md; echo wrote > scratch/from-mount.txt"
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	after, err := TreeDigest(ws.Deliverables)
	if err != nil {
		t.Fatal(err)
	}
	if before != after {
		t.Fatal("bubblewrap let the checker change the deliverable tree")
	}
	body, err := os.ReadFile(filepath.Join(ws.Deliverables, "report.md"))
	if err != nil || strings.Contains(string(body), "tampered") {
		t.Fatalf("deliverable bytes %q", body)
	}
	if _, err := os.ReadFile(filepath.Join(ws.Scratch, "from-mount.txt")); err != nil {
		t.Fatal("scratch was not writable inside the mount")
	}
	argv, err := checkerMountArgv(exec.Command("claude", "-p", CheckerPrompt), ws)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(argv, "\n")
	if !strings.Contains(joined, "--ro-bind") || !strings.Contains(joined, ws.Deliverables) {
		t.Fatalf("mount argv %q", argv)
	}
	for _, kv := range cmd.Env {
		if strings.HasPrefix(kv, "HOME=") && strings.Contains(kv, ws.Dir) {
			t.Fatalf("mount replaced HOME with the workspace: %s", kv)
		}
	}
}

func TestCheckerMountBindsTheVerifiedDescriptor(t *testing.T) {
	f, err := os.Open("/bin/sleep")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	link, err := os.Readlink(fmt.Sprintf("/proc/self/fd/%d", f.Fd()))
	if err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	ws.VerifiedPath = "/opt/controlrod/verified-sleep"
	cmd := exec.Command("/proc/self/fd/3", "-p", CheckerPrompt)
	cmd.ExtraFiles = []*os.File{f}
	argv, err := checkerMountArgv(cmd, ws)
	if err != nil {
		t.Fatal(err)
	}
	if !hasArgPair(argv, "--ro-bind-fd", "3") || !slices.Contains(argv, ws.VerifiedPath) {
		t.Fatalf("verified descriptor was not mounted at the given path: %q", argv)
	}
	if slices.Contains(argv, link) && link != ws.VerifiedPath {
		t.Fatal("mount used /proc/self/fd instead of VerifiedPath")
	}
	inner := argv[len(argv)-1]
	if inner == "/proc/self/fd/3" {
		t.Fatal("inner command still uses a descriptor bubblewrap will close")
	}
}

func TestConfirmSandboxSeesTheBubblewrapChild(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	// /bin/sleep is often a symlink to /usr/bin/sleep. Mounting the descriptor
	// onto that symlink path does not make the child execute the opened inode.
	// A regular file inside the workspace does.
	bin := filepath.Join(ws.Dir, "sleep")
	if err := copyRegularFile("/bin/sleep", bin); err != nil {
		t.Fatal(err)
	}
	f, err := os.Open(bin)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	ws.VerifiedPath = bin
	cmd := exec.Command("/proc/self/fd/3", "30")
	cmd.ExtraFiles = []*os.File{f}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_, _ = cmd.Process.Wait()
	})
	v := &VerifiedLaunch{File: f, Path: bin}
	if err := v.ConfirmSandbox(cmd.Process.Pid); err != nil {
		t.Fatalf("%v; stderr %s", err, stderr.String())
	}
	old := confirmWait
	confirmWait = 300 * time.Millisecond
	t.Cleanup(func() { confirmWait = old })
	if err := v.Confirm(cmd.Process.Pid); err == nil {
		t.Fatal("bubblewrap itself was accepted as the verified runtime")
	}
}

func TestCheckerMountBlocksWritesOutsideScratch(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	home := os.Getenv("HOME")
	if home == "" {
		t.Fatal("HOME is empty")
	}
	homeFile := filepath.Join(home, fmt.Sprintf("checker-escape-%d", os.Getpid()))
	tmpFile := filepath.Join("/tmp", fmt.Sprintf("checker-escape-%d", os.Getpid()))
	sibDir := filepath.Join(filepath.Dir(ws.Dir), "side")
	if err := os.MkdirAll(sibDir, 0o700); err != nil {
		t.Fatal(err)
	}
	sibFile := filepath.Join(sibDir, "escape.txt")
	t.Cleanup(func() {
		_ = os.Remove(homeFile)
		_ = os.Remove(tmpFile)
		_ = os.Remove(sibFile)
	})
	before, err := os.ReadFile(filepath.Join(ws.Deliverables, "report.md"))
	if err != nil {
		t.Fatal(err)
	}
	script := `echo ok > scratch/verification.json
echo x > "$HOME_FILE"; echo HOME:$? > scratch/home
echo x > "$TMP_FILE"; echo TMP:$? > scratch/tmp
echo x > "$SIB_FILE"; echo SIB:$? > scratch/sib
`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "HOME_FILE="+homeFile, "TMP_FILE="+tmpFile, "SIB_FILE="+sibFile)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(homeFile); !os.IsNotExist(err) {
		t.Fatalf("write to HOME landed on the host: %v", err)
	}
	if _, err := os.Stat(tmpFile); !os.IsNotExist(err) {
		t.Fatalf("write to /tmp landed on the host: %v", err)
	}
	if _, err := os.Stat(sibFile); !os.IsNotExist(err) {
		t.Fatalf("write to the deliverable sibling landed: %v", err)
	}
	after, err := os.ReadFile(filepath.Join(ws.Deliverables, "report.md"))
	if err != nil || string(after) != string(before) {
		t.Fatalf("deliverable bytes changed: %q", after)
	}
	for _, name := range []string{"home", "sib"} {
		b, err := os.ReadFile(filepath.Join(ws.Scratch, name))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(b), ":2") && !strings.Contains(string(b), ":1") {
			t.Fatalf("%s write was not blocked: %s", name, b)
		}
	}
	if _, err := os.ReadFile(filepath.Join(ws.Scratch, "verification.json")); err != nil {
		t.Fatal("scratch was not writable")
	}
}

func TestCheckerCannotReachAHostUnixSocket(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatal(err)
	}
	dir, err := os.MkdirTemp("/var/tmp", "cr-sock-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(dir) })
	sock := filepath.Join(dir, "agent.sock")
	ln, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	contacted := make(chan struct{}, 1)
	go func() {
		c, err := ln.Accept()
		if err == nil {
			_ = c.Close()
			contacted <- struct{}{}
		}
	}()
	ws, _ := prepareCheckerFixture(t)
	cmd := exec.Command("python3", "-c", `import socket,sys
s=socket.socket(socket.AF_UNIX)
s.settimeout(2)
try:
    s.connect(sys.argv[1])
except Exception:
    sys.exit(0)
sys.exit(2)
`, sock)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "SSH_AUTH_SOCK="+sock, "DBUS_SESSION_BUS_ADDRESS=unix:path="+sock, "DOCKER_HOST=unix://"+sock)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatalf("checker reached the host socket: %v", err)
	}
	select {
	case <-contacted:
		t.Fatal("the host socket accepted a connection from the checker")
	default:
	}
	for _, kv := range cmd.Env {
		for _, key := range []string{"SSH_AUTH_SOCK=", "DBUS_SESSION_BUS_ADDRESS=", "DOCKER_HOST="} {
			if strings.HasPrefix(kv, key) {
				t.Fatalf("checker environment kept %s", kv)
			}
		}
	}
	joined := strings.Join(cmd.Args, "\n")
	if !strings.Contains(joined, "--unshare-ipc") || !strings.Contains(joined, "--ro-bind\n/dev/null\n"+sock) {
		t.Fatalf("socket was not hidden: %q", cmd.Args)
	}
}

func TestCheckerProcDoesNotReachHostProcesses(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	marker := filepath.Join("/tmp", fmt.Sprintf("controlrod-proc-marker-%d", os.Getpid()))
	if err := os.WriteFile(marker, []byte("host-marker\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.Remove(marker) })
	// A fresh pid namespace has no host pid. /proc/<host-pid>/root and
	// /proc/<host-pid>/fd used to reach a writable host mount.
	script := fmt.Sprintf(`found=0
if [ -e /proc/%d/root ] || [ -e /proc/%d/fd ]; then found=1; fi
for d in /proc/[0-9]*; do
  if grep -q host-marker "$d/root%s" 2>/dev/null; then found=1; fi
done
echo "$found" > scratch/status
`, os.Getpid(), os.Getpid(), marker)
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	status, err := os.ReadFile(filepath.Join(ws.Scratch, "status"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(status)) != "0" {
		t.Fatal("a /proc/<pid>/root or fd path reached the host marker")
	}
}

func TestCheckerMountRestoresTheStagedRuntimeAndSkipsAnEmptyVerifiedPath(t *testing.T) {
	if err := os.MkdirAll(StageRoot(), 0o700); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	argv, err := checkerMountArgv(exec.Command("/bin/true"), ws)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(argv, "\n")
	if !strings.Contains(joined, "--unshare-pid") || !strings.Contains(joined, "--proc\n/proc") {
		t.Fatalf("pid namespace or fresh procfs missing: %q", argv)
	}
	if !strings.Contains(joined, "--ro-bind\n"+StageRoot()+"\n"+StageRoot()) {
		t.Fatalf("staged runtime root was not mounted read-only: %q", argv)
	}
	if strings.Contains(joined, "--ro-bind-fd") {
		t.Fatal("an empty verified path still bound a descriptor")
	}
	fdCmd := exec.Command("/proc/self/fd/3")
	if _, err := checkerMountArgv(fdCmd, ws); err == nil {
		t.Fatal("a descriptor command with no verified path was mounted")
	}
}

func TestCheckerCannotRewriteLoginInstructions(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	outside, err := os.MkdirTemp("/var/tmp", "cr-login-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(outside) })
	for _, parent := range []string{t.TempDir(), outside} {
		t.Run(filepath.Base(parent), func(t *testing.T) {
			assertLoginWritesStayOffTheHost(t, parent)
		})
	}
}

func assertLoginWritesStayOffTheHost(t *testing.T, parent string) {
	t.Helper()
	claudeDir := filepath.Join(parent, "claude")
	codexDir := filepath.Join(parent, "codex")
	if err := os.MkdirAll(filepath.Join(claudeDir, "projects", "other", "memory"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(codexDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "projects", "other", "memory", "MEMORY.md"), []byte("keep\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "settings.json"), []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "CLAUDE.md"), []byte("do not change\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(codexDir, "config.toml"), []byte("sandbox_mode = \"read-only\"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(codexDir, "AGENTS.md"), []byte("do not change\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CLAUDE_CONFIG_DIR", claudeDir)
	t.Setenv("CODEX_HOME", codexDir)
	ws, _ := prepareCheckerFixture(t)
	ws.CheckerRuntime = RuntimeClaude
	ws.LoginRoot = claudeDir
	before, err := hashProtected(claudeDir)
	if err != nil {
		t.Fatal(err)
	}
	ws.LoginDigest = before
	script := `mkdir -p "$CLAUDE_CONFIG_DIR/projects/other/memory"
echo pwn > "$CLAUDE_CONFIG_DIR/projects/other/memory/MEMORY.md"; echo M:$? > scratch/m
echo new > "$CLAUDE_CONFIG_DIR/projects/other/memory/new.md"
echo pwn > "$CLAUDE_CONFIG_DIR/settings.json"; echo C:$? > scratch/c
echo pwn > "$CLAUDE_CONFIG_DIR/CLAUDE.md"; echo D:$? > scratch/d
echo pwn > "$CLAUDE_CONFIG_DIR/CLAUDE.local.md"; echo L:$? > scratch/l
mkdir "$CLAUDE_CONFIG_DIR/hooks"; echo H:$? > scratch/h
echo pwn > "$CODEX_HOME/config.toml"; echo X:$? > scratch/x
echo pwn > "$CODEX_HOME/AGENTS.md"; echo A:$? > scratch/a
printf '%s' '{"outcome":"pass","findings":[]}' > scratch/verification.json`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "CLAUDE_CONFIG_DIR="+claudeDir, "CODEX_HOME="+codexDir)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	argv := strings.Join(cmd.Args, "\n")
	if !strings.Contains(argv, "--ro-bind\n"+claudeDir+"\n"+claudeDir) {
		t.Fatalf("login root was not mounted read-only: %q", cmd.Args)
	}
	if strings.Contains(argv, "--dir\n") || strings.Contains(argv, "--bind\n"+filepath.Join(claudeDir, "projects")+"\n") {
		t.Fatalf("real projects directory is writable: %q", cmd.Args)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"c", "d", "l", "h", "x", "a"} {
		b, err := os.ReadFile(filepath.Join(ws.Scratch, name))
		if err != nil {
			t.Fatal(err)
		}
		if strings.HasSuffix(strings.TrimSpace(string(b)), ":0") {
			t.Fatalf("%s write succeeded: %s", name, b)
		}
	}
	mem, err := os.ReadFile(filepath.Join(claudeDir, "projects", "other", "memory", "MEMORY.md"))
	if err != nil || string(mem) != "keep\n" {
		t.Fatalf("project memory changed: %q %v", mem, err)
	}
	if _, err := os.Lstat(filepath.Join(claudeDir, "projects", "other", "memory", "new.md")); !os.IsNotExist(err) {
		t.Fatalf("new memory file landed on the host: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(claudeDir, "CLAUDE.local.md")); !os.IsNotExist(err) {
		t.Fatalf("absent CLAUDE.local.md was created: %v", err)
	}
	if _, err := os.Lstat(filepath.Join(claudeDir, "hooks")); !os.IsNotExist(err) {
		t.Fatalf("absent hooks directory was created: %v", err)
	}
	got, err := os.ReadFile(filepath.Join(claudeDir, "settings.json"))
	if err != nil || string(got) != "{}\n" {
		t.Fatalf("claude settings changed: %q", got)
	}
	tree, cwd := checkerBaseline(t, ws)
	res := settleChecker(ws, tree, cwd, time.Now())
	if !res.Counts {
		t.Fatal(res.Error)
	}
	if err := os.WriteFile(filepath.Join(claudeDir, "CLAUDE.local.md"), []byte("planted\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	res = settleChecker(ws, tree, cwd, time.Now())
	assertVoid(t, res, "login instructions")
}

func TestCheckerSessionSymlinkDoesNotGrantHomeWrites(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	home := t.TempDir()
	codexDir := filepath.Join(home, ".codex")
	if err := os.MkdirAll(codexDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(home, filepath.Join(codexDir, "sessions")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CODEX_HOME", codexDir)
	ws, _ := prepareCheckerFixture(t)
	ws.CheckerRuntime = RuntimeCodex
	plan, err := planCheckerLogin(ws)
	if err != nil {
		t.Fatal(err)
	}
	for _, o := range plan.Overlays {
		if o.Dest == filepath.Join(codexDir, "sessions") {
			t.Fatal("a symlinked session directory was mounted")
		}
	}
	paths, err := checkerSeatbeltPaths(plan)
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range paths {
		if p == home || strings.HasPrefix(p, home+string(os.PathSeparator)) && !strings.HasPrefix(p, codexDir+string(os.PathSeparator)) {
			t.Fatalf("seatbelt would allow %s", p)
		}
	}
	script := `echo pwn > "$CODEX_HOME/sessions/pwned"; echo S:$? > scratch/s
printf '%s' '{"outcome":"pass","findings":[]}' > scratch/verification.json`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "CODEX_HOME="+codexDir)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(home, "pwned")); !os.IsNotExist(err) {
		t.Fatalf("symlink granted a write in the home directory: %v", err)
	}
}

func TestPreparedCheckerThroughTheMount(t *testing.T) {
	if _, err := exec.LookPath("bwrap"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	before, cwd := checkerBaseline(t, ws)
	criterion := `{"package_id":"WP-0007","package_revision":2,"release_manifest_digest":{"algorithm":"sha256","value":"` + strings.Repeat("ab", 32) + `"},"results":[{"criterion_id":"C1","outcome":"pass","check_results":[{"check_id":"K1","outcome":"pass","evidence_refs":[]}],"finding_refs":[]}]}`
	script := "mkdir -p scratch/evidence; printf '%s' 'Independent review log' > scratch/evidence/checks.md; printf '%s' '" + `{"outcome":"pass","findings":[]}` + "' > scratch/verification.json; printf '%s' '" + criterion + "' > scratch/criterion-results.json"
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if err := cmd.Run(); err != nil {
		t.Fatalf("mount launch: %v", err)
	}
	res := settleChecker(ws, before, cwd, time.Now())
	if !res.Counts {
		t.Fatal(res.Error)
	}
	if string(res.Verification) != `{"outcome":"pass","findings":[]}` {
		t.Fatalf("verification %s", res.Verification)
	}
	if string(res.Criterion) != criterion {
		t.Fatalf("criterion %s", res.Criterion)
	}
	if len(res.Evidence) != 1 || res.Evidence[0].Name != "evidence/checks.md" {
		t.Fatalf("evidence %+v", res.Evidence)
	}
	raw, err := base64.StdEncoding.DecodeString(res.Evidence[0].ContentBase64)
	if err != nil || string(raw) != "Independent review log" {
		t.Fatalf("evidence bytes %q %v", raw, err)
	}
}
