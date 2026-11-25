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

func TestParseCgroupKeepsTheKernelsText(t *testing.T) {
	got, err := parseCgroup("12:pids:/x\n0::/user.slice/a.scope\n")
	if err != nil || got != "/sys/fs/cgroup/user.slice/a.scope" {
		t.Fatalf("a live cgroup reads as it is: %q %v", got, err)
	}
	// Removed, or a live cgroup with this text in its name: told apart by Locate, not here.
	got, err = parseCgroup("0::/user.slice/a.scope (deleted)\n")
	if err != nil || got != "/sys/fs/cgroup/user.slice/a.scope (deleted)" {
		t.Fatalf("the kernel's text is kept: %q %v", got, err)
	}
	if _, err := parseCgroup("12:pids:/x\n"); err == nil {
		t.Fatal("no cgroup v2 line is no membership")
	}
}

// cgroup2Mount finds the cgroup v2 hierarchy, or "".
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

// cgroupFixture makes a child cgroup named name beside this process's own, and a sleeping child
// moved into it. It returns the cgroup's directory, the parent as cgroupOf reports paths, and the
// child, which the test owns (it is killed and reaped at cleanup).
func cgroupFixture(t *testing.T, name string) (dir, reported string, cmd *exec.Cmd) {
	t.Helper()
	mount := cgroup2Mount()
	if os.Geteuid() != 0 || mount == "" {
		t.Skip("needs root and a cgroup v2 hierarchy")
	}
	own, err := cgroupOf(os.Getpid())
	if err != nil {
		t.Skip(err)
	}
	rel := filepath.Dir(strings.TrimPrefix(own, "/sys/fs/cgroup"))
	dir = filepath.Join(mount, rel, name)
	if err := os.Mkdir(dir, 0o755); errors.Is(err, os.ErrExist) {
		t.Fatalf("a unique cgroup name collided: %v", err)
	} else if err != nil {
		t.Skipf("cannot make a cgroup here: %v", err)
	}
	cmd = exec.Command("sleep", "60")
	if err := cmd.Start(); err != nil {
		os.Remove(dir)
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = cmd.Process.Kill()
		_ = cmd.Wait()
		removeCgroup(t, dir)
	})
	if err := os.WriteFile(filepath.Join(dir, "cgroup.procs"), []byte(strconv.Itoa(cmd.Process.Pid)), 0o644); err != nil {
		t.Skipf("cannot move a process into a cgroup here: %v", err)
	}
	return dir, filepath.Join("/sys/fs/cgroup", rel), cmd
}

// removeCgroup removes dir, waiting out the moment after a task exits before the kernel counts the
// cgroup empty (as systemd sees it).
func removeCgroup(t *testing.T, dir string) {
	t.Helper()
	for deadline := time.Now().Add(5 * time.Second); ; {
		err := os.Remove(dir)
		if err == nil || errors.Is(err, os.ErrNotExist) {
			return
		}
		if !errors.Is(err, syscall.EBUSY) || time.Now().After(deadline) {
			t.Fatal(err)
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func testUnit(t *testing.T) string {
	return fmt.Sprintf("controlrod-test-%d-%d", os.Getpid(), time.Now().UnixNano())
}

// A run that exits at once leaves its leader unreaped while systemd collects the empty scope.
// Locate must find it in that scope, not wait out its deadline and call it uncontained.
func TestLocateFindsALeaderThatExitedInItsCollectedScope(t *testing.T) {
	unit := testUnit(t)
	dir, reported, cmd := cgroupFixture(t, unit+".scope")
	pid := cmd.Process.Pid
	_ = cmd.Process.Kill()
	// Held unreaped: wait for the zombie, then collect its scope as systemd would.
	for deadline := time.Now().Add(5 * time.Second); ; {
		if _, err := processStart(pid); errors.Is(err, errNotRunning) {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the leader never exited")
		}
		time.Sleep(5 * time.Millisecond)
	}
	removeCgroup(t, dir)
	u, err := (Container{Mode: ContainCgroup, ScopeParent: reported}).Locate(pid, unit)
	if err != nil {
		t.Fatalf("a leader that exited inside its scope must be located: %v", err)
	}
	if want := reported + "/" + unit + ".scope"; u.Cgroup != want {
		t.Fatalf("located at %q, want the scope's own place %q", u.Cgroup, want)
	}
}

// A live process in a live cgroup whose name merely ends in " (deleted)" is not in the scope.
func TestLocateRefusesALiveCgroupNamedLikeARemovedScope(t *testing.T) {
	old := locateWait
	locateWait = 200 * time.Millisecond
	defer func() { locateWait = old }()
	unit := testUnit(t)
	_, reported, cmd := cgroupFixture(t, unit+".scope (deleted)")
	if _, err := (Container{Mode: ContainCgroup, ScopeParent: reported}).Locate(cmd.Process.Pid, unit); err == nil {
		t.Fatal("a live process outside the scope must not be located in it")
	}
}
