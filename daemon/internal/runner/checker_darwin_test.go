//go:build darwin

package runner

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// These run the Seatbelt checker profile for real, on a Mac (the platforms workflow runs them on
// macos-15). They are the macOS counterpart of the bubblewrap tests in checker_linux_test.go: what
// a checker may write, which session folders it may read, and that it cannot reach a host socket.

func seatbeltFixture(t *testing.T) *Workspace {
	t.Helper()
	if _, err := exec.LookPath("sandbox-exec"); err != nil {
		t.Fatal(err)
	}
	ws, _ := prepareCheckerFixture(t)
	return ws
}

func TestSeatbeltCheckerBlocksWritesOutsideScratch(t *testing.T) {
	ws := seatbeltFixture(t)
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
echo x > "$HOME_FILE"; echo HOME:$? > scratch/evidence/home
echo x > "$TMP_FILE"; echo TMP:$? > scratch/evidence/tmp
echo x > "$SIB_FILE"; echo SIB:$? > scratch/evidence/sib
echo x >> "$DELIVERABLE"; echo DEL:$? > scratch/evidence/del
echo x > "$TMPDIR/run-tmp"; echo RUNTMP:$? > scratch/evidence/runtmp
`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "HOME_FILE="+homeFile, "TMP_FILE="+tmpFile, "SIB_FILE="+sibFile,
		"DELIVERABLE="+filepath.Join(ws.Deliverables, "report.md"))
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	for _, p := range []string{homeFile, tmpFile, sibFile} {
		if _, err := os.Stat(p); !os.IsNotExist(err) {
			t.Fatalf("write to %s landed on the host: %v", p, err)
		}
	}
	after, err := os.ReadFile(filepath.Join(ws.Deliverables, "report.md"))
	if err != nil || string(after) != string(before) {
		t.Fatalf("deliverable bytes changed: %q", after)
	}
	for _, name := range []string{"home", "tmp", "sib", "del"} {
		b, err := os.ReadFile(filepath.Join(ws.Scratch, "evidence", name))
		if err != nil {
			t.Fatal(err)
		}
		if strings.HasSuffix(strings.TrimSpace(string(b)), ":0") {
			t.Fatalf("%s write was not blocked: %s", name, b)
		}
	}
	if b, err := os.ReadFile(filepath.Join(ws.Scratch, "evidence", "runtmp")); err != nil || strings.TrimSpace(string(b)) != "RUNTMP:0" {
		t.Fatalf("the run's own temporary folder was not writable: %q %v", b, err)
	}
	if _, err := os.ReadFile(filepath.Join(ws.Scratch, "verification.json")); err != nil {
		t.Fatal("scratch was not writable")
	}
}

func TestSeatbeltCheckerCannotReachAHostUnixSocket(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatal(err)
	}
	ws := seatbeltFixture(t)
	// A short path: a Unix socket path on macOS is limited to 104 bytes.
	dir, err := os.MkdirTemp("/tmp", "cr-sock-")
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
	cmd := exec.Command("python3", "-c", `import socket,sys
try:
    s=socket.socket(socket.AF_UNIX)
    s.settimeout(2)
    s.connect(sys.argv[1])
except OSError:
    raise SystemExit(0)
raise SystemExit(2)
`, sock)
	cmd.Dir = ws.Dir
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME")}
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("checker reached the host socket: %v: %s", err, out)
	}
	select {
	case <-contacted:
		t.Fatal("the host socket accepted a connection from the checker")
	case <-time.After(200 * time.Millisecond):
	}
}

func TestSeatbeltCheckerCannotReadSessionFolders(t *testing.T) {
	login := t.TempDir()
	for _, d := range []string{"projects", "debug", "todos"} {
		if err := os.MkdirAll(filepath.Join(login, d), 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(login, d, "secret.txt"), []byte("cr-session-canary"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(login, "settings.json"), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CLAUDE_CONFIG_DIR", login)
	ws := seatbeltFixture(t)
	ws.CheckerRuntime = RuntimeClaude
	script := `for d in projects debug todos; do cat "$LOGIN/$d/secret.txt" > /dev/null 2>&1; echo $d:$? >> scratch/evidence/reads; done
cat "$LOGIN/settings.json" > /dev/null 2>&1; echo settings:$? >> scratch/evidence/reads
echo pwn > "$LOGIN/settings.json"; echo write:$? >> scratch/evidence/reads`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "LOGIN="+login)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	b, err := os.ReadFile(filepath.Join(ws.Scratch, "evidence", "reads"))
	if err != nil {
		t.Fatal(err)
	}
	got := strings.Fields(string(b))
	want := map[string]bool{"projects": false, "debug": false, "todos": false, "settings": true, "write": false}
	if len(got) != len(want) {
		t.Fatalf("reads %q", got)
	}
	for _, line := range got {
		name, code, _ := strings.Cut(line, ":")
		if ok, known := want[name]; !known || (code == "0") != ok {
			t.Fatalf("%s returned %s (want allowed=%v); all: %q", name, code, ok, got)
		}
	}
	if s, _ := os.ReadFile(filepath.Join(login, "settings.json")); string(s) != "{}" {
		t.Fatalf("the login folder was written: %q", s)
	}
}

func TestSeatbeltCheckerSessionSymlinkDoesNotGrantHomeWrites(t *testing.T) {
	home := t.TempDir()
	claudeDir := filepath.Join(home, ".claude")
	if err := os.MkdirAll(claudeDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(home, filepath.Join(claudeDir, "projects")); err != nil {
		t.Fatal(err)
	}
	t.Setenv("CLAUDE_CONFIG_DIR", claudeDir)
	ws := seatbeltFixture(t)
	ws.CheckerRuntime = RuntimeClaude
	script := `echo pwn > "$CLAUDE_CONFIG_DIR/projects/pwned"; echo S:$? > scratch/evidence/s
printf '%s' '{"outcome":"pass","findings":[]}' > scratch/verification.json`
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	cmd.Env = append(os.Environ(), "CLAUDE_CONFIG_DIR="+claudeDir)
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("%v: %s", err, out)
	}
	if _, err := os.Lstat(filepath.Join(home, "pwned")); !os.IsNotExist(err) {
		t.Fatalf("symlink granted a write in the home directory: %v", err)
	}
}

// Codex's own Seatbelt helper cannot start inside another Seatbelt profile, so a macOS Codex
// checker is not wrapped; its own permission profile carries the limits.
func TestSeatbeltCodexCheckerIsSelfConfined(t *testing.T) {
	ws := seatbeltFixture(t)
	ws.CheckerRuntime = RuntimeCodex
	cmd := exec.Command("/bin/echo", "ok")
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if len(cmd.Args) != 2 || cmd.Args[0] != "/bin/echo" {
		t.Fatalf("a Codex checker was wrapped: %q", cmd.Args)
	}
}

func TestSeatbeltPreparedCheckerSettles(t *testing.T) {
	ws := seatbeltFixture(t)
	before, cwd := checkerBaseline(t, ws)
	criterion := `{"package_id":"WP-0007","package_revision":2,"release_manifest_digest":{"algorithm":"sha256","value":"` + strings.Repeat("ab", 32) + `"},"results":[{"criterion_id":"C1","outcome":"pass","check_results":[{"check_id":"K1","outcome":"pass","evidence_refs":[]}],"finding_refs":[]}]}`
	script := "mkdir -p scratch/evidence; printf '%s' 'Independent review log' > scratch/evidence/checks.md; printf '%s' '" +
		`{"outcome":"pass","findings":[]}` + "' > scratch/verification.json; printf '%s' '" + criterion + "' > scratch/criterion-results.json"
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.Dir = ws.Dir
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("mount launch: %v: %s", err, out)
	}
	res := settleChecker(ws, before, cwd, time.Now())
	if !res.Counts {
		t.Fatal(res.Error)
	}
	if string(res.Verification) != `{"outcome":"pass","findings":[]}` {
		t.Fatalf("verification %s", res.Verification)
	}
}

// A checker must resolve its model provider's host name. macOS answers lookups over
// mDNSResponder's Unix socket, which the blanket Unix-socket deny would block (ENOTFOUND).
func TestSeatbeltCheckerResolvesHostNames(t *testing.T) {
	if _, err := exec.LookPath("python3"); err != nil {
		t.Fatal(err)
	}
	const lookup = `import socket,sys
socket.getaddrinfo(sys.argv[1], 443)
`
	const host = "api.anthropic.com"
	if out, err := exec.Command("python3", "-c", lookup, host).CombinedOutput(); err != nil {
		t.Skipf("this machine cannot resolve %s without the sandbox either: %v: %s", host, err, out)
	}
	ws := seatbeltFixture(t)
	cmd := exec.Command("python3", "-c", lookup, host)
	cmd.Dir = ws.Dir
	cmd.Env = []string{"PATH=" + os.Getenv("PATH"), "HOME=" + os.Getenv("HOME")}
	if err := applyCheckerMount(cmd, ws); err != nil {
		t.Fatal(err)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("the checker could not resolve %s: %v: %s", host, err, out)
	}
}
