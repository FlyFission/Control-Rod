//go:build linux

package runner

import (
	"bufio"
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
	for _, line := range strings.Split(string(b), "\n") {
		if rest, ok := strings.CutPrefix(line, "0::"); ok {
			return filepath.Join("/sys/fs/cgroup", rest), nil
		}
	}
	return "", errors.New("no cgroup v2 membership")
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

// populated reports whether any process remains in a cgroup. A cgroup that no longer exists is
// empty (systemd collects an empty scope).
func populated(dir string) bool {
	f, err := os.Open(filepath.Join(dir, "cgroup.events"))
	if err != nil {
		return false
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		if v, ok := strings.CutPrefix(sc.Text(), "populated "); ok {
			return strings.TrimSpace(v) == "1"
		}
	}
	return false
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
	// Freezing completes asynchronously; wait until the kernel reports the cgroup frozen.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		b, err := os.ReadFile(filepath.Join(u.Cgroup, "cgroup.events"))
		if err != nil || strings.Contains(string(b), "frozen 1") || !strings.Contains(string(b), "populated 1") {
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

// OrphanScopes lists run scopes under the scope parent that still hold processes.
func (k Container) OrphanScopes() []Unit {
	if k.Mode != ContainCgroup || k.ScopeParent == "" {
		return nil
	}
	entries, err := os.ReadDir(k.ScopeParent)
	if err != nil {
		return nil
	}
	var out []Unit
	for _, e := range entries {
		name := e.Name()
		if !e.IsDir() || !strings.HasPrefix(name, UnitPrefix) || !strings.HasSuffix(name, ".scope") {
			continue
		}
		dir := filepath.Join(k.ScopeParent, name)
		if populated(dir) {
			out = append(out, Unit{Mode: ContainCgroup, Name: strings.TrimSuffix(name, ".scope"), Cgroup: dir})
		}
	}
	return out
}
