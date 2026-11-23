//go:build unix

package runner

import (
	"context"
	"errors"
	"os/exec"
	"syscall"
	"testing"
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
