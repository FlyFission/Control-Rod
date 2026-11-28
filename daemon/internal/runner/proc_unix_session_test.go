//go:build unix

package runner

import (
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// An agent process leads its own session and process group, so it has no controlling terminal
// and the group kill still reaches it (review DMN-21).
func TestAgentProcessLeadsItsOwnSessionWithoutTheDaemonsTerminal(t *testing.T) {
	cmd := finishCommand(exec.Command("sleep", "30"), &Workspace{Dir: t.TempDir()}, os.Environ())
	if cmd.Stdin != nil {
		t.Fatal("an agent command must not inherit the daemon's standard input")
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	pid := cmd.Process.Pid
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	t.Cleanup(func() { _ = syscall.Kill(-pid, syscall.SIGKILL) })

	pgid, err := syscall.Getpgid(pid)
	if err != nil || pgid != pid {
		t.Fatalf("process group %d (%v), want %d", pgid, err, pid)
	}
	if runtime.GOOS == "linux" {
		b, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/stat")
		if err != nil {
			t.Fatal(err)
		}
		fields := strings.Fields(string(b[strings.LastIndexByte(string(b), ')')+1:]))
		// After the name: state, ppid, pgrp, session, tty_nr.
		if fields[3] != strconv.Itoa(pid) {
			t.Fatalf("session %s, want %d", fields[3], pid)
		}
		if fields[4] != "0" {
			t.Fatalf("controlling terminal %s, want none", fields[4])
		}
		if target, err := os.Readlink("/proc/" + strconv.Itoa(pid) + "/fd/0"); err != nil || target != os.DevNull {
			t.Fatalf("standard input is %q (%v), want %s", target, err, os.DevNull)
		}
	}
	if err := syscall.Kill(-pid, syscall.SIGTERM); err != nil {
		t.Fatalf("group kill: %v", err)
	}
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the group kill did not end the process")
	}
}
