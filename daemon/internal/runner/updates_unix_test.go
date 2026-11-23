//go:build unix

package runner

import (
	"context"
	"errors"
	"os/exec"
	"syscall"
	"testing"
	"time"
)

// A run whose stop was not confirmed and whose receipt never reached disk still holds updates
// while its process group exists, and releases them once it is gone.
func TestAgentUpdateWaitsForAnUnconfirmedStopWithoutAReceipt(t *testing.T) {
	api := &updateAPI{}
	h := &fakeHost{installed: "1.0.77", latest: "1.0.92"}
	d := hostDaemon(t, api, h)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	child := exec.Command("sleep", "30")
	child.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = child.Process.Kill(); _, _ = child.Process.Wait() })
	started := d.holdIfUnconfirmed("R-1", func(pid int) (*SpawnReceipt, error) {
		// As when the receipt write fails: the containment is in hand, the receipt is not on disk.
		return &SpawnReceipt{Containment: ContainGroup, PGID: pid}, errors.New("receipts: disk full")
	})
	if _, err := started(child.Process.Pid); err == nil {
		t.Fatal("the hook's error was lost")
	}
	d.noteUncontained("R-1")
	api.requested = []AgentUpdateRequest{{"grok", "1.0.92"}}
	d.takeAgentUpdates(ctx)
	if len(h.ran) != 0 || api.takes != 0 {
		t.Fatalf("updated while an unconfirmed run's processes remained: ran %v", h.ran)
	}
	_ = child.Process.Kill()
	_, _ = child.Process.Wait()
	d.takeAgentUpdates(ctx)
	if len(h.ran) != 1 {
		t.Fatalf("still waiting after the processes were gone: ran %v, takes %d", h.ran, api.takes)
	}
}

// A receipt that recorded its boot, read back when the current boot cannot be read, still holds
// updates while its process group exists: an unreadable boot proves nothing.
func TestAgentUpdateHoldsWhenTheBootCannotBeRead(t *testing.T) {
	boot, err := bootID()
	if err != nil {
		t.Skip("no boot id on this host")
	}
	child := exec.Command("sleep", "30")
	child.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := child.Start(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = child.Process.Kill(); _, _ = child.Process.Wait() })
	r := SpawnReceipt{Containment: ContainGroup, PID: child.Process.Pid, PGID: child.Process.Pid, BootID: boot, ProcessStart: "not this one"}
	if !r.mayRemain() {
		t.Fatal("a live group with this boot was counted gone")
	}
	saved := holdBootID
	t.Cleanup(func() { holdBootID = saved })
	holdBootID = func() (string, error) { return "", errors.New("boot id unreadable") }
	if !r.mayRemain() {
		t.Fatal("released the hold although the boot could not be read")
	}
	holdBootID = func() (string, error) { return "another-boot", nil }
	if r.mayRemain() {
		t.Fatal("a group from an earlier boot was counted alive")
	}
}

// A run of one daemon holds the agent install lock shared: a second daemon on another home, and a
// terminal update, both using the same npm, install nothing until it ends.
func TestAgentUpdateWaitsForARunOfAnotherDaemonHome(t *testing.T) {
	lock := t.TempDir() + "/.controlrod-agents.lock"
	busy := hostDaemon(t, &updateAPI{}, &fakeHost{installed: "1.0.77", latest: "1.0.92"})
	busy.cfg.AgentLock = lock
	api := &updateAPI{requested: []AgentUpdateRequest{{"grok", "1.0.92"}}}
	h := &fakeHost{installed: "1.0.77", latest: "1.0.92"}
	idle := hostDaemon(t, api, h)
	idle.cfg.AgentLock = lock
	ctx := context.Background()
	idle.checkAgentUpdates(ctx)

	held, release, done := make(chan struct{}), make(chan struct{}), make(chan struct{})
	busy.startJob(func() { close(held); <-release; close(done) })
	<-held
	if _, err := TryLockAgentsExclusive(lock); !errors.Is(err, ErrAgentsInUse) {
		t.Fatalf("a terminal update could take the lock during a run: %v", err)
	}
	idle.takeAgentUpdates(ctx)
	if len(h.ran) != 0 || api.takes != 0 {
		t.Fatalf("another daemon updated during a run: ran %v, takes %d", h.ran, api.takes)
	}
	close(release)
	<-done
	for busy.inFlight.Load() != 0 {
		time.Sleep(time.Millisecond)
	}
	idle.takeAgentUpdates(ctx)
	if len(h.ran) != 1 {
		t.Fatalf("did not update once the run ended: %v", h.ran)
	}
}
