//go:build unix

package runner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"time"
)

func setProcessGroup(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}

// processStart reads when a process started, in a form that changes if the id is reused.
func processStart(pid int) (string, error) {
	if runtime.GOOS == "linux" {
		b, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
		if err != nil {
			return "", err
		}
		// The command name (field 2) may contain spaces and parentheses; fields resume after the last ")".
		s := string(b)
		i := strings.LastIndexByte(s, ')')
		if i < 0 {
			return "", errors.New("unreadable process status")
		}
		fields := strings.Fields(s[i+1:])
		// After the name: state is field 3, so start time (field 22) is index 19 here.
		if len(fields) < 20 {
			return "", errors.New("unreadable process status")
		}
		return fields[19], nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "ps", "-o", "lstart=", "-p", fmt.Sprint(pid)).Output()
	if err != nil {
		return "", err
	}
	if s := strings.TrimSpace(string(out)); s != "" {
		return s, nil
	}
	return "", errors.New("process not found")
}

// bootID identifies the current boot.
func bootID() (string, error) {
	if runtime.GOOS == "linux" {
		b, err := os.ReadFile("/proc/sys/kernel/random/boot_id")
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(b)), nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "sysctl", "-n", "kern.boottime").Output()
	if err != nil {
		return "", ErrNoIdentity
	}
	return strings.TrimSpace(string(out)), nil
}

// signalGroup sends sig to the receipt's process group, but only while the receipt still matches
// the live process. It reports whether the signal was sent.
func signalGroup(r SpawnReceipt, sig syscall.Signal) bool {
	if !r.Matches() {
		return false
	}
	return syscall.Kill(-r.PGID, sig) == nil
}

// StopTimings are the waits of the graceful stop ladder.
type StopTimings struct {
	// AfterHangup is how long to wait after SIGHUP before SIGTERM.
	AfterHangup time.Duration
	// Grace is how long to wait after SIGTERM before SIGKILL.
	Grace time.Duration
}

// StopGracefully ends a run's process group (specification 22): write authority on the workspace
// is revoked first, then SIGHUP, SIGTERM after a pause, and SIGKILL after the grace period. Every
// signal is checked against the receipt, so a process that already exited, or a reused process id,
// is never signalled. It returns once exited is closed or the ladder is spent; the caller records
// the run stopped only after observing the exit itself.
func StopGracefully(r SpawnReceipt, t StopTimings, exited <-chan struct{}) {
	RevokeWrite(r.Workspace)
	steps := []struct {
		sig  syscall.Signal
		wait time.Duration
	}{{syscall.SIGHUP, t.AfterHangup}, {syscall.SIGTERM, t.Grace}, {syscall.SIGKILL, 0}}
	for _, step := range steps {
		select {
		case <-exited:
			return
		default:
		}
		if !signalGroup(r, step.sig) {
			return
		}
		if step.wait <= 0 {
			continue
		}
		timer := time.NewTimer(step.wait)
		select {
		case <-exited:
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

// killProcessGroup kills the agent and everything it started. Used only for this daemon's own
// unreaped child, whose id cannot have been reused.
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}
