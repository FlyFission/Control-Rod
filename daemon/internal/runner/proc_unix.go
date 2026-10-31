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

// errNotRunning means the process exists only as a zombie: it has exited and waits to be reaped.
var errNotRunning = errors.New("process has exited")

// processStart reads when a running process started, in a form that changes if the id is reused.
// A zombie (exited, not yet reaped) is not running and gives errNotRunning.
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
		// After the name: state is field 3 (index 0 here) and start time field 22 (index 19).
		if len(fields) < 20 {
			return "", errors.New("unreadable process status")
		}
		if fields[0] == "Z" || fields[0] == "X" {
			return "", errNotRunning
		}
		return fields[19], nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, "ps", "-o", "stat=,lstart=", "-p", fmt.Sprint(pid)).Output()
	if err != nil {
		return "", err
	}
	stat, start, _ := strings.Cut(strings.TrimSpace(string(out)), " ")
	if strings.HasPrefix(stat, "Z") {
		return "", errNotRunning
	}
	if s := strings.TrimSpace(start); s != "" {
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

// processExists reports whether a process (running or not yet reaped) has this id.
func processExists(pid int) bool {
	err := syscall.Kill(pid, 0)
	return err == nil || errors.Is(err, syscall.EPERM)
}

// groupExists reports whether a running (not zombie) process is in the group. Used only in process
// group mode, where a group id reused after the group emptied cannot be told apart (documented
// limit). On Linux it reads process states, since a zombie still counts as a member to kill(2).
func groupExists(pgid int) bool {
	if runtime.GOOS != "linux" {
		err := syscall.Kill(-pgid, 0)
		return err == nil || errors.Is(err, syscall.EPERM)
	}
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return false
	}
	for _, e := range entries {
		if e.Name()[0] < '0' || e.Name()[0] > '9' {
			continue
		}
		b, err := os.ReadFile("/proc/" + e.Name() + "/stat")
		if err != nil {
			continue
		}
		s := string(b)
		i := strings.LastIndexByte(s, ')')
		if i < 0 {
			continue
		}
		f := strings.Fields(s[i+1:])
		// State is index 0 and the process group index 2.
		if len(f) > 2 && f[0] != "Z" && f[0] != "X" && f[2] == fmt.Sprint(pgid) {
			return true
		}
	}
	return false
}

// Alive reports whether any process of the run may remain. In cgroup mode that is the kernel's
// own answer for the scope, and an unreadable answer counts as alive. In process group mode it is
// the leader (unless it is a zombie) or any running member of its group: conservative, since the
// group number alone cannot prove which processes are the run's.
func (r SpawnReceipt) Alive() bool {
	if r.Containment == ContainCgroup {
		return r.unit().cgroupAlive()
	}
	return r.Matches() || (r.PGID > 0 && r.bootMatches() && groupExists(r.PGID))
}

// Pinned returns the receipt marked as held unreaped by this daemon (see waitExitNoReap).
func (r SpawnReceipt) Pinned() SpawnReceipt { r.pinned = true; return r }

func (r SpawnReceipt) bootMatches() bool {
	b, err := bootID()
	return err == nil && b == r.BootID
}

func (r SpawnReceipt) unit() Unit {
	return Unit{Mode: r.Containment, Name: r.Unit, Cgroup: r.Cgroup, PGID: r.PGID}
}

// signal sends sig to every process of the run. In process group mode it signals only while the
// leader still matches the receipt (a live leader keeps its group number from being reused).
func (r SpawnReceipt) signal(sig syscall.Signal) error {
	if r.Containment == ContainCgroup {
		r.unit().cgroupSignal(sig)
		return nil
	}
	if r.pinned {
		return syscall.Kill(-r.PGID, sig)
	}
	// Not held by this daemon (an orphan after a restart): signal only while a pidfd pins the
	// leader, so its group number cannot be reused between the identity check and the signal.
	return withPinnedLeader(r.PID, r.Matches, func() error { return syscall.Kill(-r.PGID, sig) })
}

// freeze freezes or thaws the run, confirmed: in cgroup mode by the kernel's frozen state, in
// process group mode (Linux) by every member reporting stopped. Anything unconfirmed is an error.
func (r SpawnReceipt) freeze(on bool) error {
	if r.Containment == ContainCgroup {
		return r.unit().cgroupFreeze(on)
	}
	sig := syscall.SIGCONT
	if on {
		sig = syscall.SIGSTOP
	}
	if err := r.signal(sig); err != nil || !on {
		return err
	}
	if runtime.GOOS != "linux" {
		return errors.New("stopping a process group cannot be confirmed on this platform")
	}
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if groupStopped(r.PGID) {
			return nil
		}
		time.Sleep(5 * time.Millisecond)
	}
	return errors.New("the process group did not report stopped")
}

// groupStopped reports whether every running member of a group is stopped (state T).
func groupStopped(pgid int) bool {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return false
	}
	for _, e := range entries {
		if e.Name()[0] < '0' || e.Name()[0] > '9' {
			continue
		}
		b, err := os.ReadFile("/proc/" + e.Name() + "/stat")
		if err != nil {
			continue
		}
		s := string(b)
		i := strings.LastIndexByte(s, ')')
		if i < 0 {
			continue
		}
		f := strings.Fields(s[i+1:])
		if len(f) > 2 && f[2] == fmt.Sprint(pgid) && f[0] != "T" && f[0] != "t" && f[0] != "Z" && f[0] != "X" {
			return false
		}
	}
	return true
}

func (r SpawnReceipt) kill() {
	if r.Containment == ContainCgroup {
		if err := r.unit().cgroupKill(); err == nil {
			return
		}
		r.unit().cgroupSignal(syscall.SIGKILL)
		return
	}
	_ = r.signal(syscall.SIGKILL)
}

// StopTimings are the waits of the graceful stop ladder.
type StopTimings struct {
	// AfterHangup is how long to wait after SIGHUP before SIGTERM.
	AfterHangup time.Duration
	// Grace is how long to wait after SIGTERM before killing every process of the run.
	Grace time.Duration
}

// killWait is how long a stop waits for the unit to empty after the final kill.
var killWait = 10 * time.Second

// waitGone waits until no process of the run remains, or d passes.
func waitGone(r SpawnReceipt, d time.Duration) bool {
	deadline := time.Now().Add(d)
	for r.Alive() {
		if time.Now().After(deadline) {
			return false
		}
		time.Sleep(20 * time.Millisecond)
	}
	return true
}

// StopGracefully ends every process of a run (specification 22) and reports whether that was
// verified. Write authority ends first: the run is frozen (confirmed), snapshot records the outputs
// as they stand, and nothing written after that counts. If freezing cannot be confirmed, the run
// is killed first and snapshot afterwards, so the snapshot still follows the last possible write.
// Otherwise the run is thawed for SIGHUP, SIGTERM after a pause, and finally killed after the grace
// period: atomically through cgroup.kill in cgroup mode. It returns true only once no process of
// the run remains.
func StopGracefully(r SpawnReceipt, t StopTimings, snapshot func()) bool {
	if !r.Alive() {
		if snapshot != nil {
			snapshot()
		}
		return true
	}
	if err := r.freeze(true); err != nil {
		r.kill()
		gone := waitGone(r, killWait)
		if snapshot != nil && gone {
			snapshot()
		}
		return gone
	}
	if snapshot != nil {
		snapshot()
	}
	_ = r.freeze(false)
	_ = r.signal(syscall.SIGHUP)
	if waitGone(r, t.AfterHangup) {
		return true
	}
	_ = r.signal(syscall.SIGTERM)
	if waitGone(r, t.Grace) {
		return true
	}
	r.kill()
	return waitGone(r, killWait)
}

// killProcessGroup kills the agent and everything it started. Used only for this daemon's own
// unreaped child, whose id cannot have been reused.
func killProcessGroup(cmd *exec.Cmd) {
	if cmd.Process == nil {
		return
	}
	_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
}
