//go:build linux

package confinement

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

type afterCallbackAuthority struct {
	inner *testAuthority
	after func()
}

func (a *afterCallbackAuthority) WithCurrent(ctx context.Context, id string, fn func(Grant, func(Event) error) error) error {
	a.inner.mu.Lock()
	defer a.inner.mu.Unlock()
	var pending []Event
	if err := fn(cloneGrant(a.inner.grant), func(e Event) error { pending = append(pending, e); return nil }); err != nil {
		return err
	}
	// Commit can consume time after the callback returns, while still holding
	// grant/lease/stop synchronization and before publishing pending events.
	if a.after != nil {
		a.after()
	}
	a.inner.events = append(a.inner.events, pending...)
	return nil
}
func TestReviewExpiryDuringCommit(t *testing.T) {
	for _, op := range []string{"open", "read", "write"} {
		t.Run(op, func(t *testing.T) {
			f := setup(t)
			a := &afterCallbackAuthority{inner: f.a}
			f.options.Authority = a
			b, err := Open(context.Background(), f.options)
			if err != nil {
				t.Fatal(err)
			}
			defer b.Close()
			a.after = func() { f.now = f.a.grant.ExpiresAt }
			switch op {
			case "open":
				another, err := Open(context.Background(), f.options)
				if another != nil {
					defer another.Close()
				}
				if err == nil {
					t.Fatal("Open succeeded after expiry during commit")
				}
			case "read":
				data, err := b.ReadInput(context.Background(), "source")
				if err == nil || len(data) != 0 {
					t.Fatalf("read returned %q after expiry during commit", data)
				}
			case "write":
				receipt, err := b.WriteProposal(context.Background(), []byte("proposal"))
				if err == nil || receipt != (Receipt{}) {
					data, _ := os.ReadFile(filepath.Join(f.out, "proposal.json"))
					t.Fatalf("write returned receipt %+v; artifact %q after expiry during commit", receipt, data)
				}
				if _, e := os.Stat(filepath.Join(f.out, "proposal.json")); !os.IsNotExist(e) {
					t.Fatalf("refused proposal remains: %v", e)
				}
			}
		})
	}
}
func TestReviewCancellationDuringCommit(t *testing.T) {
	for _, op := range []string{"open", "read", "write"} {
		t.Run(op, func(t *testing.T) {
			f := setup(t)
			a := &afterCallbackAuthority{inner: f.a}
			f.options.Authority = a
			b, err := Open(context.Background(), f.options)
			if err != nil {
				t.Fatal(err)
			}
			defer b.Close()
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			a.after = cancel
			switch op {
			case "open":
				another, err := Open(ctx, f.options)
				if another != nil {
					defer another.Close()
				}
				if err == nil {
					t.Fatal("construction returned after cancellation during commit")
				}
			case "read":
				data, err := b.ReadInput(ctx, "source")
				if err == nil || len(data) != 0 {
					t.Fatalf("data=%q error=%v", data, err)
				}
			case "write":
				receipt, err := b.WriteProposal(ctx, []byte("proposal"))
				if err == nil || receipt != (Receipt{}) {
					t.Fatalf("receipt=%+v error=%v", receipt, err)
				}
				if _, err := os.Stat(filepath.Join(f.out, "proposal.json")); !os.IsNotExist(err) {
					t.Fatalf("refused proposal remains: %v", err)
				}
			}
			if op != "open" && len(f.a.events) != 1 {
				t.Fatalf("committed I/O history lost: %v", f.a.events)
			}
		})
	}
}
