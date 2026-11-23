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
	want := "(pid " + strconv.Itoa(os.Getpid()) + ")"
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

func TestAHomeThatCannotLockFailsClosed(t *testing.T) {
	orig := flockHome
	flockHome = func(int, int) error { return syscall.EOPNOTSUPP }
	defer func() { flockHome = orig }()
	if _, err := LockHome(t.TempDir()); err == nil || !strings.Contains(err.Error(), "will not start") {
		t.Fatalf("an unlockable home must refuse to start: %v", err)
	}
}
