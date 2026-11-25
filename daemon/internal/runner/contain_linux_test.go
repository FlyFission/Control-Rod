package runner

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestUnreadableCgroupStateCountsAsAlive(t *testing.T) {
	dir := t.TempDir()
	if populated(filepath.Join(dir, "gone")) {
		t.Fatal("a cgroup that no longer exists is empty")
	}
	ev := filepath.Join(dir, "cgroup.events")
	if err := os.WriteFile(ev, []byte("populated 0\nfrozen 0\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if populated(dir) {
		t.Fatal("populated 0 is empty")
	}
	if err := os.WriteFile(ev, []byte("frozen 0\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !populated(dir) {
		t.Fatal("an answer without the populated field is not proof of empty")
	}
	if os.Getuid() != 0 {
		if err := os.Chmod(ev, 0); err != nil {
			t.Fatal(err)
		}
		if !populated(dir) {
			t.Fatal("an unreadable cgroup counts as populated")
		}
	}
}

func TestAZombieOfACollectedScopeIsStillInIt(t *testing.T) {
	got, err := parseCgroup("0::/user.slice/app.slice/controlrod-run-x-g1.scope (deleted)\n")
	if err != nil || got != "/sys/fs/cgroup/user.slice/app.slice/controlrod-run-x-g1.scope" {
		t.Fatalf("a removed cgroup is still the one the process was in: %q %v", got, err)
	}
	got, err = parseCgroup("12:pids:/x\n0::/user.slice/a.scope\n")
	if err != nil || got != "/sys/fs/cgroup/user.slice/a.scope" {
		t.Fatalf("a live cgroup reads as it is: %q %v", got, err)
	}
	if _, err := parseCgroup("12:pids:/x\n"); err == nil {
		t.Fatal("no cgroup v2 line is no membership")
	}
}

// cgroup2Mount finds a cgroup v2 hierarchy this process can make children in, or "".
func cgroup2Mount() string {
	b, err := os.ReadFile("/proc/self/mountinfo")
	if err != nil {
		return ""
	}
	for _, line := range strings.Split(string(b), "\n") {
		f := strings.Fields(line)
		for i, v := range f {
			if v == "-" && i+1 < len(f) && f[i+1] == "cgroup2" && len(f) > 4 {
				return f[4]
			}
		}
	}
	return ""
}

// A run that exits at once leaves its leader unreaped while systemd collects the empty scope.
// Locate must find it in that scope at once, not wait out its deadline and call it uncontained.
func TestLocateFindsALeaderThatExitedInItsCollectedScope(t *testing.T) {
	mount := cgroup2Mount()
	if os.Geteuid() != 0 || mount == "" {
		t.Skip("needs a writable cgroup v2 hierarchy")
	}
	own, err := cgroupOf(os.Getpid())
	if err != nil {
		t.Skip(err)
	}
	const unit = "controlrod-test-collected"
	// Make the scope beside this process's own cgroup, as the kernel reports paths from the mount.
	rel := strings.TrimPrefix(own, "/sys/fs/cgroup")
	dir := filepath.Join(mount, filepath.Dir(rel), unit+".scope")
	if err := os.Mkdir(dir, 0o755); err != nil {
		t.Skipf("cannot make a cgroup here: %v", err)
	}
	defer os.Remove(dir)
	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer cmd.Wait()
	pid := cmd.Process.Pid
	if err := os.WriteFile(filepath.Join(dir, "cgroup.procs"), []byte(strconv.Itoa(pid)), 0o644); err != nil {
		cmd.Process.Kill()
		t.Skipf("cannot move a process into a cgroup here: %v", err)
	}
	_ = cmd.Process.Kill()
	// Held unreaped: wait for the zombie, then collect its scope as systemd would.
	for deadline := time.Now().Add(5 * time.Second); ; {
		b, _ := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
		if f := strings.Fields(string(b)); len(f) > 2 && f[2] == "Z" {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the leader never exited")
		}
		time.Sleep(5 * time.Millisecond)
	}
	// The kernel counts the cgroup empty a moment after the zombie shows, as systemd sees it.
	for deadline := time.Now().Add(5 * time.Second); ; {
		err := os.Remove(dir)
		if err == nil {
			break
		}
		if !errors.Is(err, syscall.EBUSY) || time.Now().After(deadline) {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Millisecond)
	}
	start := time.Now()
	u, err := (Container{Mode: ContainCgroup}).Locate(pid, unit)
	if err != nil {
		t.Fatalf("a leader that exited inside its scope must be located: %v", err)
	}
	if !strings.HasSuffix(u.Cgroup, "/"+unit+".scope") {
		t.Fatalf("located at %q", u.Cgroup)
	}
	if took := time.Since(start); took > time.Second {
		t.Fatalf("located only after %s", took)
	}
}
