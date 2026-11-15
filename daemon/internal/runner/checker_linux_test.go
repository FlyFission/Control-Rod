//go:build linux

package runner

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

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
	cmd := exec.Command("/proc/self/fd/3", "-p", CheckerPrompt)
	cmd.ExtraFiles = []*os.File{f}
	argv, err := checkerMountArgv(cmd, ws)
	if err != nil {
		t.Fatal(err)
	}
	if !hasArgPair(argv, "--ro-bind-fd", "3") || !slices.Contains(argv, link) {
		t.Fatalf("verified descriptor was not mounted: %q", argv)
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
	f, err := os.Open("/bin/sleep")
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	ws, _ := prepareCheckerFixture(t)
	cmd := exec.Command("/proc/self/fd/3", "30")
	cmd.ExtraFiles = []*os.File{f}
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
	v := &VerifiedLaunch{File: f, Path: "/bin/sleep"}
	if err := v.ConfirmSandbox(cmd.Process.Pid); err != nil {
		t.Fatal(err)
	}
	old := confirmWait
	confirmWait = 300 * time.Millisecond
	t.Cleanup(func() { confirmWait = old })
	if err := v.Confirm(cmd.Process.Pid); err == nil {
		t.Fatal("bubblewrap itself was accepted as the verified runtime")
	}
}
