//go:build linux

package runner

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// cgroupOf returns the absolute cgroup v2 directory a process belongs to.
func cgroupOf(pid int) (string, error) {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/cgroup", pid))
	if err != nil {
		return "", err
	}
	return parseCgroup(string(b))
}

// parseCgroup reads the cgroup v2 line of a /proc/<pid>/cgroup file, exactly as the kernel prints
// it. For a removed cgroup the kernel appends " (deleted)"; that is left in place, since a live
// cgroup may carry the same text in its own name (see exitedInRemovedScope).
func parseCgroup(s string) (string, error) {
	for _, line := range strings.Split(s, "\n") {
		if rest, ok := strings.CutPrefix(line, "0::"); ok {
			return filepath.Join("/sys/fs/cgroup", rest), nil
		}
	}
	return "", errors.New("no cgroup v2 membership")
}

// exitedInRemovedScope reports whether dir, as cgroupOf read it for pid, is the removed scope of
// unit and pid has exited. A run that exits at once leaves its leader unreaped in an empty scope,
// which systemd-run --collect removes; the kernel then prints that scope with " (deleted)". Only an
// exited process is accepted this way: a live one cannot be in a removed cgroup, so a live process
// whose cgroup reads like this is in a live cgroup that merely has the text in its name.
func exitedInRemovedScope(pid int, dir, unit string) bool {
	if !hasSuffix(dir, "/"+unit+".scope (deleted)") {
		return false
	}
	_, err := processStart(pid)
	return errors.Is(err, errNotRunning)
}

// DetectContainer picks cgroup containment when a systemd user manager can start a scope here, and
// the process group otherwise. CONTROLROD_CONTAINMENT=process-group forces the fallback.
func DetectContainer(getenv func(string) string) Container {
	if getenv("CONTROLROD_CONTAINMENT") == ContainGroup {
		return Container{Mode: ContainGroup}
	}
	if _, err := exec.LookPath("systemd-run"); err != nil {
		return Container{Mode: ContainGroup}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	unit := fmt.Sprintf("controlrod-probe-%d", os.Getpid())
	out, err := exec.CommandContext(ctx, "systemd-run", "--user", "--scope", "--quiet", "--collect", "--unit="+unit, "--", "cat", "/proc/self/cgroup").Output()
	if err != nil {
		return Container{Mode: ContainGroup}
	}
	for _, line := range strings.Split(string(out), "\n") {
		if rest, ok := strings.CutPrefix(line, "0::"); ok && strings.HasSuffix(rest, "/"+unit+".scope") {
			dir := filepath.Join("/sys/fs/cgroup", rest)
			if _, err := os.Stat(filepath.Join(filepath.Dir(dir), "cgroup.procs")); err == nil {
				return Container{Mode: ContainCgroup, ScopeParent: filepath.Dir(dir)}
			}
		}
	}
	return Container{Mode: ContainGroup}
}

// populated reports whether any process may remain in a cgroup. Only a cgroup that no longer
// exists (systemd collects an empty scope) or reports "populated 0" is empty; any other answer,
// including an unreadable one, counts as populated, so nothing is assumed gone without proof.
func populated(dir string) bool {
	b, err := os.ReadFile(filepath.Join(dir, "cgroup.events"))
	if errors.Is(err, os.ErrNotExist) {
		return false
	}
	if err != nil {
		return true
	}
	for _, line := range strings.Split(string(b), "\n") {
		if v, ok := strings.CutPrefix(line, "populated "); ok {
			return strings.TrimSpace(v) != "0"
		}
	}
	return true
}

// frozenState reads whether a cgroup reports itself frozen.
func frozenState(dir string) (bool, error) {
	b, err := os.ReadFile(filepath.Join(dir, "cgroup.events"))
	if err != nil {
		return false, err
	}
	for _, line := range strings.Split(string(b), "\n") {
		if v, ok := strings.CutPrefix(line, "frozen "); ok {
			return strings.TrimSpace(v) == "1", nil
		}
	}
	return false, errors.New("cgroup.events has no frozen field")
}

func cgroupPIDs(dir string) []int {
	b, err := os.ReadFile(filepath.Join(dir, "cgroup.procs"))
	if err != nil {
		return nil
	}
	var out []int
	for _, f := range strings.Fields(string(b)) {
		if n, err := strconv.Atoi(f); err == nil && n > 0 {
			out = append(out, n)
		}
	}
	return out
}

// Linux syscall numbers for pidfds; the same on every architecture since Linux 5.3.
const (
	sysPidfdSendSignal = 424
	sysPidfdOpen       = 434
)

// signalPinned signals pid only if, once pinned by a pidfd, it still belongs to dir. The pidfd
// holds the process, so its id cannot be reused between the check and the signal.
func signalPinned(pid int, dir string, sig syscall.Signal) {
	fd, _, errno := syscall.Syscall(sysPidfdOpen, uintptr(pid), 0, 0)
	if errno != 0 {
		return
	}
	defer syscall.Close(int(fd))
	if got, err := cgroupOf(pid); err != nil || got != dir {
		return
	}
	_, _, _ = syscall.Syscall6(sysPidfdSendSignal, fd, uintptr(sig), 0, 0, 0, 0)
}

func (u Unit) cgroupAlive() bool { return u.Cgroup != "" && populated(u.Cgroup) }

// signalLeaderPinned signals one process through a pidfd, only if the pinned process still matches
// the identity check. The pidfd names that exact process, so a reused id is never signalled. It
// reaches only the leader: a pidfd does not reserve the leader's process group number, so the
// group is never signalled by number on the strength of it.
func signalLeaderPinned(pid int, matches func() bool, sig syscall.Signal) error {
	fd, _, errno := syscall.Syscall(sysPidfdOpen, uintptr(pid), 0, 0)
	if errno != 0 {
		return errNoIdentityToSignal
	}
	defer syscall.Close(int(fd))
	if !matches() {
		return errNoIdentityToSignal
	}
	if _, _, e := syscall.Syscall6(sysPidfdSendSignal, fd, uintptr(sig), 0, 0, 0, 0); e != 0 {
		return e
	}
	return nil
}

// cgroupFreeze freezes or thaws a cgroup. Freezing is confirmed: it returns only once the kernel
// reports the cgroup frozen, and any failure to write or read that state is an error.
func (u Unit) cgroupFreeze(on bool) error {
	v := "0"
	if on {
		v = "1"
	}
	if err := os.WriteFile(filepath.Join(u.Cgroup, "cgroup.freeze"), []byte(v), 0); err != nil {
		return err
	}
	if !on {
		return nil
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		frozen, err := frozenState(u.Cgroup)
		if err != nil {
			return err
		}
		if frozen {
			return nil
		}
		time.Sleep(5 * time.Millisecond)
	}
	return errors.New("the cgroup did not report frozen")
}

func (u Unit) cgroupSignal(sig syscall.Signal) {
	for _, pid := range cgroupPIDs(u.Cgroup) {
		signalPinned(pid, u.Cgroup, sig)
	}
}

func (u Unit) cgroupKill() error {
	return os.WriteFile(filepath.Join(u.Cgroup, "cgroup.kill"), []byte("1"), 0)
}

// OrphanScopes lists this namespace's run scopes under the scope parent that still hold processes.
func (k Container) OrphanScopes() []Unit {
	if k.Mode != ContainCgroup || k.ScopeParent == "" || k.NS == "" {
		return nil
	}
	entries, err := os.ReadDir(k.ScopeParent)
	if err != nil {
		return nil
	}
	var out []Unit
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() || !strings.HasPrefix(name, UnitPrefix(k.NS)) || !strings.HasSuffix(name, ".scope") {
			continue
		}
		dir := filepath.Join(k.ScopeParent, name)
		if populated(dir) {
			out = append(out, Unit{Mode: ContainCgroup, Name: strings.TrimSuffix(name, ".scope"), Cgroup: dir})
		}
	}
	return out
}

// procStat reads a process's state, process group and start time from /proc/<pid>/stat.
func procStat(pid int) (state string, pgid int, start string, err error) {
	b, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return "", 0, "", err
	}
	s := string(b)
	i := strings.LastIndexByte(s, ')')
	if i < 0 {
		return "", 0, "", errors.New("unreadable process status")
	}
	f := strings.Fields(s[i+1:])
	// After the name: state (index 0), process group (index 2), start time (index 19).
	if len(f) < 20 {
		return "", 0, "", errors.New("unreadable process status")
	}
	pgid, err = strconv.Atoi(f[2])
	return f[0], pgid, f[19], err
}

// signalOrphan signals every process of a run whose receipt this daemon does not hold unreaped (an
// orphan after a restart), each through its own pidfd, never by group number (issue #178). Members
// of the receipt's group count as the run's only while its leader is proven alive in that group:
// a group number cannot be reused while a member, here the leader, is in it. So the leader is
// pinned and checked against the receipt, each member is pinned and checked again after pinning,
// and the leader is checked once more before anything is sent. When the leader is gone nothing in
// its group can be proven the run's, so only the (gone) leader is tried, as before.
func signalOrphan(r SpawnReceipt, sig syscall.Signal) error {
	lfd, _, errno := syscall.Syscall(sysPidfdOpen, uintptr(r.PID), 0, 0)
	if errno != 0 {
		return errNoIdentityToSignal
	}
	defer syscall.Close(int(lfd))
	leaderIn := func() bool {
		if !r.Matches() {
			return false
		}
		_, pgid, _, err := procStat(r.PID)
		return err == nil && r.PGID > 0 && pgid == r.PGID
	}
	if !leaderIn() {
		// Not in its group (or not the receipt's process): the leader alone, as signalLeaderPinned does.
		return signalLeaderPinned(r.PID, r.Matches, sig)
	}
	type member struct {
		pid   int
		start string
	}
	var found []member
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return signalLeaderPinned(r.PID, r.Matches, sig)
	}
	for _, e := range entries {
		pid, err := strconv.Atoi(e.Name())
		if err != nil || pid == r.PID {
			continue
		}
		st, pgid, start, err := procStat(pid)
		if err != nil || pgid != r.PGID || st == "Z" || st == "X" {
			continue
		}
		found = append(found, member{pid, start})
	}
	var fds []uintptr
	defer func() {
		for _, fd := range fds {
			syscall.Close(int(fd))
		}
	}()
	for _, m := range found {
		fd, _, errno := syscall.Syscall(sysPidfdOpen, uintptr(m.pid), 0, 0)
		if errno != 0 {
			continue // gone already
		}
		// Pinned now: the id names this process for as long as the descriptor is open. It must
		// still be the process read above, still in the run's group.
		if _, pgid, start, err := procStat(m.pid); err != nil || pgid != r.PGID || start != m.start {
			syscall.Close(int(fd))
			continue
		}
		fds = append(fds, fd)
	}
	// The leader was in the group before and after every member was read, so each was in the
	// run's group, never a reused one.
	if !leaderIn() {
		return signalLeaderPinned(r.PID, r.Matches, sig)
	}
	var first error
	if _, _, e := syscall.Syscall6(sysPidfdSendSignal, lfd, uintptr(sig), 0, 0, 0, 0); e != 0 {
		first = e
	}
	for _, fd := range fds {
		_, _, _ = syscall.Syscall6(sysPidfdSendSignal, fd, uintptr(sig), 0, 0, 0, 0)
	}
	return first
}
