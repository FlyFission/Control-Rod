package runner

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"
)

// A run that waits for its runtime's other run keeps its lease with heartbeats, so the wait is not
// mistaken for lost contact (review DMN-8).
func TestAWaitingRunKeepsItsLease(t *testing.T) {
	job := &Job{Run: testRun("run-wait", "author"), Claim: RunClaim{Token: "claim-run-wait", HeartbeatSeconds: 1}}
	api, srv := newFakeAPI(t)
	d := New(Config{API: srv.URL, Token: testToken, Home: t.TempDir(), Runtimes: []string{RuntimeFake},
		Heartbeat: 60 * time.Millisecond, LogInterval: 10 * time.Millisecond, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	sent := time.Now()
	lease := newLeaseClock(sent, "", d.heartbeat(job))
	first := lease.deadline()
	ctx, stop := context.WithCancelCause(context.Background())
	defer stop(nil)
	end := d.heartbeatWhile(job, lease, stop, "Waiting for this agent's other run on this machine")
	time.Sleep(4 * first.Sub(sent)) // well past the first lease
	end()
	if ctx.Err() != nil {
		t.Fatalf("the waiting run was stopped: %v", context.Cause(ctx))
	}
	if !lease.deadline().After(first) {
		t.Fatal("the lease was never renewed while the run waited")
	}
	api.mu.Lock()
	posts := api.logs["run-wait"]
	api.mu.Unlock()
	if len(posts) < 2 || posts[0].Label != "Waiting for this agent's other run on this machine" || posts[0].ClaimToken != "claim-run-wait" {
		t.Fatalf("posts %+v", posts)
	}
}

// A wait the control plane no longer holds ends the run as lost.
func TestAWaitingRunTheControlPlaneGaveUpIsLost(t *testing.T) {
	job := &Job{Run: testRun("run-wait-gone", "author"), Claim: RunClaim{Token: "claim-run-wait-gone", HeartbeatSeconds: 1}}
	api, srv := newFakeAPI(t)
	api.gone["run-wait-gone"] = true
	d := New(Config{API: srv.URL, Token: testToken, Home: t.TempDir(), Runtimes: []string{RuntimeFake},
		Heartbeat: 30 * time.Millisecond, LogInterval: 10 * time.Millisecond, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	lease := newLeaseClock(time.Now(), "", d.heartbeat(job))
	ctx, stop := context.WithCancelCause(context.Background())
	end := d.heartbeatWhile(job, lease, stop, "waiting")
	defer end()
	select {
	case <-ctx.Done():
		if !errors.Is(context.Cause(ctx), errLost) {
			t.Fatalf("cause %v", context.Cause(ctx))
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the run was not stopped")
	}
}
