//go:build unix

package runner

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
)

func TestASecondDaemonNamesTheHolderPID(t *testing.T) {
	home := t.TempDir()
	unlock, err := LockHome(home)
	if err != nil {
		t.Fatal(err)
	}
	defer unlock()
	_, err = LockHome(home)
	want := "records pid " + strconv.Itoa(os.Getpid()) + " "
	if err == nil || !strings.Contains(err.Error(), want) || !strings.Contains(err.Error(), "already running") {
		t.Fatalf("the refusal must name the holder %s: %v", want, err)
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
	if _, err := LockHome(home); err == nil || !strings.Contains(err.Error(), "single name") || !strings.Contains(err.Error(), "first, then remove") {
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
	if err == nil || strings.Contains(err.Error(), "pid") || !strings.Contains(err.Error(), "already running") {
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
