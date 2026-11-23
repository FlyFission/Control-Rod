//go:build unix

package runner

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

func TestASecondDaemonNamesTheHolderPID(t *testing.T) {
	home := t.TempDir()
	unlock, err := LockHome(home)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	_, err = LockHome(home)
	want := "names pid " + strconv.Itoa(os.Getpid()) + ", which may be that daemon or an unrelated process"
	if err == nil || !strings.Contains(err.Error(), want) || !strings.Contains(err.Error(), "may already be running") || !strings.Contains(err.Error(), "Check the process list") {
		t.Fatalf("the refusal must name the PID as a lead, not as the daemon, and ask for a check (%s): %v", want, err)
	}
	// Losing must not erase the holder's PID.
	b, rerr := os.ReadFile(filepath.Join(home, "daemon.lock"))
	if rerr != nil || strings.TrimSpace(string(b)) != strconv.Itoa(os.Getpid()) {
		t.Fatalf("daemon.lock = %q, %v; want the holder's PID", b, rerr)
	}
}

func TestANewHolderReplacesAStalePID(t *testing.T) {
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, "daemon.lock"), []byte("99999999\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	unlock, err := LockHome(home)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	b, _ := os.ReadFile(filepath.Join(home, "daemon.lock"))
	if strings.TrimSpace(string(b)) != strconv.Itoa(os.Getpid()) {
		t.Fatalf("daemon.lock = %q; want this process's PID", b)
	}
}

func TestASymlinkedLockFileIsRefusedAndItsTargetLeftAlone(t *testing.T) {
	home := t.TempDir()
	target := filepath.Join(t.TempDir(), "precious")
	if err := os.WriteFile(target, []byte("keep me\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, filepath.Join(home, "daemon.lock")); err != nil {
		t.Fatal(err)
	}
	if _, err := LockHome(home); err == nil || !strings.Contains(err.Error(), "symbolic link") {
		t.Fatalf("a symlinked daemon.lock must be refused: %v", err)
	}
	if b, _ := os.ReadFile(target); string(b) != "keep me\n" {
		t.Fatalf("the link's target was changed: %q", b)
	}
}

func TestAHardLinkedLockFileIsRefusedAndTheOtherNameLeftAlone(t *testing.T) {
	home := t.TempDir()
	other := filepath.Join(home, "precious")
	if err := os.WriteFile(other, []byte("keep me\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(other, filepath.Join(home, "daemon.lock")); err != nil {
		t.Skipf("hard links unavailable here: %v", err)
	}
	if _, err := LockHome(home); err == nil || !strings.Contains(err.Error(), "single name") || !strings.Contains(err.Error(), "Check the process list for a Control Rod daemon using home") || !strings.Contains(err.Error(), "then remove") {
		t.Fatalf("a hard-linked daemon.lock must be refused: %v", err)
	}
	if b, _ := os.ReadFile(other); string(b) != "keep me\n" {
		t.Fatalf("the other name's content was changed: %q", b)
	}
}

func TestACleanReleaseLeavesNoPIDAndADeadPIDIsNotNamed(t *testing.T) {
	home := t.TempDir()
	unlock, err := LockHome(home)
	if err != nil {
		t.Fatal(err)
	}
	unlock()
	if b, err := os.ReadFile(filepath.Join(home, "daemon.lock")); err != nil || len(b) != 0 {
		t.Fatalf("a clean release must leave daemon.lock in place and empty: %q, %v", b, err)
	}
	if processExists(99999999) {
		t.Skip("a process with that PID exists here")
	}
	// A holder whose recorded PID is not a live process (the window before a new holder writes its
	// own): the refusal must not name it.
	unlock, err = LockHome(home)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	if err := os.WriteFile(filepath.Join(home, "daemon.lock"), []byte("99999999\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = LockHome(home)
	if err == nil || strings.Contains(err.Error(), "pid") || !strings.Contains(err.Error(), "may already be running") {
		t.Fatalf("a dead PID must not be named: %v", err)
	}
}

func TestAHomeThatCannotLockFailsClosed(t *testing.T) {
	orig := flockHome
	flockHome = func(int, int) error { return syscall.EOPNOTSUPP }
	defer func() { flockHome = orig }()
	if _, err := LockHome(t.TempDir()); err == nil || !strings.Contains(err.Error(), "will not start") {
		t.Fatalf("an unlockable home must refuse to start: %v", err)
	}
}

// A lock path that is not a regular file is refused without reading it: a PID read from a FIFO (or
// a device) could block. The refusal names a PID only from a regular file, and always asks for a
// check that no daemon uses the home before the path is removed.
func TestAFIFOLockPathIsRefusedWithoutBlocking(t *testing.T) {
	home := t.TempDir()
	if err := syscall.Mkfifo(filepath.Join(home, "daemon.lock"), 0o600); err != nil {
		t.Skipf("mkfifo unavailable here: %v", err)
	}
	done := make(chan error, 1)
	go func() { _, err := LockHome(home); done <- err }()
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "not a plain file") || strings.Contains(err.Error(), "pid") || !strings.Contains(err.Error(), "Check the process list") {
			t.Fatalf("a FIFO daemon.lock must be refused, naming no PID: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("LockHome blocked on a FIFO daemon.lock")
	}
}

// The not-a-plain-file refusal with a live PID in the file names it only as a lead.
func TestAHardLinkedLockFileWithALivePIDNamesItAsALeadOnly(t *testing.T) {
	home := t.TempDir()
	other := filepath.Join(home, "other")
	if err := os.WriteFile(other, []byte(strconv.Itoa(os.Getpid())+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(other, filepath.Join(home, "daemon.lock")); err != nil {
		t.Skipf("hard links unavailable here: %v", err)
	}
	_, err := LockHome(home)
	want := "daemon.lock names pid " + strconv.Itoa(os.Getpid()) + ", which may be that daemon or an unrelated process"
	if err == nil || !strings.Contains(err.Error(), want) || !strings.Contains(err.Error(), "Check the process list for a Control Rod daemon using home") || strings.Contains(err.Error(), "the Control Rod daemon using this home (") {
		t.Fatalf("the PID must be a lead, not presented as the daemon: %v", err)
	}
}
