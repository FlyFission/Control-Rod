//go:build unix

package runner

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"testing"
	"time"
)

func TestLockHomeWithWaitWritesPIDAndReportsContention(t *testing.T) {
	home := t.TempDir()
	ctx := context.Background()

	f, err := LockHomeWithWait(ctx, home, 100*time.Millisecond)
	if err != nil {
		t.Fatalf("first LockHomeWithWait failed: %v", err)
	}
	defer func() {
		_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
		_ = f.Close()
	}()

	// Verify holder PID was written to daemon.lock.
	raw, err := os.ReadFile(filepath.Join(home, "daemon.lock"))
	if err != nil {
		t.Fatalf("reading daemon.lock: %v", err)
	}
	wantPID := strconv.Itoa(os.Getpid())
	if strings.TrimSpace(string(raw)) != wantPID {
		t.Fatalf("daemon.lock PID = %q, want %q", strings.TrimSpace(string(raw)), wantPID)
	}

	// Second caller contending on the lock must time out and include the holder PID in the error,
	// without truncating the holder PID on disk.
	_, err = LockHomeWithWait(ctx, home, 35*time.Millisecond)
	if err == nil {
		t.Fatal("expected contention error on second LockHomeWithWait")
	}
	if !strings.Contains(err.Error(), "already running") || !strings.Contains(err.Error(), "pid "+wantPID) {
		t.Fatalf("expected holder PID %s in contention error, got: %v", wantPID, err)
	}

	rawAfter, err := os.ReadFile(filepath.Join(home, "daemon.lock"))
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(rawAfter)) != wantPID {
		t.Fatalf("contending open clobbered holder PID: got %q, want %q", strings.TrimSpace(string(rawAfter)), wantPID)
	}
}

func TestLockHomeWithWaitAcquiresAfterReleaseAndFailsClosedOnUnsupported(t *testing.T) {
	home := t.TempDir()
	ctx := context.Background()

	unlock, err := LockHome(home)
	if err != nil {
		t.Fatal(err)
	}
	released := make(chan struct{})
	go func() {
		defer close(released)
		time.Sleep(30 * time.Millisecond)
		unlock()
	}()

	f, err := LockHomeWithWait(ctx, home, 500*time.Millisecond)
	if err != nil {
		t.Fatalf("expected LockHomeWithWait to acquire lock after release, got: %v", err)
	}
	_ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN)
	_ = f.Close()
	<-released

	// Verify fail-closed behavior when filesystem reports EOPNOTSUPP / ErrUnsupported.
	origFlock := flockHomeFn
	flockHomeFn = func(fd int, how int) error {
		return syscall.EOPNOTSUPP
	}
	defer func() { flockHomeFn = origFlock }()

	if _, err := LockHomeWithWait(ctx, t.TempDir(), 50*time.Millisecond); !errors.Is(err, errors.ErrUnsupported) {
		t.Fatalf("expected fail-closed errors.ErrUnsupported, got: %v", err)
	}
}

func TestProbeHealthOutcomesAndBootBarrier(t *testing.T) {
	readySt := RuntimeStatus{Runtime: "claude", Ready: true, Version: "2.1.0"}
	if got := ClassifyProbeOutcome(readySt, nil); got != ProbeReady {
		t.Fatalf("ClassifyProbeOutcome(ready) = %q, want %q", got, ProbeReady)
	}

	deadSt := RuntimeStatus{Runtime: "codex", Ready: false, Reason: "codex is installed, but it is not signed in"}
	if got := ClassifyProbeOutcome(deadSt, nil); got != ProbeDead {
		t.Fatalf("ClassifyProbeOutcome(dead) = %q, want %q", got, ProbeDead)
	}

	transientSt := RuntimeStatus{Runtime: "claude", Ready: false, Reason: "claude --version did not answer: context deadline exceeded"}
	if got := ClassifyProbeOutcome(transientSt, context.DeadlineExceeded); got != ProbeFailed {
		t.Fatalf("transient probe timeout collapsed to %q, want %q", got, ProbeFailed)
	}

	// Single transient ProbeFailed must not mark a previously Ready runtime dead even below mass-failure threshold.
	breaker := MassFailureBreaker{MinRuntimes: 5}
	prev := []RuntimeStatus{readySt}
	eff, tripped := breaker.EvaluatePass(prev, []ProbeObservation{
		{Status: transientSt, Outcome: ProbeFailed},
	})
	if tripped {
		t.Fatal("breaker should not trip on 1 runtime when MinRuntimes=5")
	}
	if len(eff) != 1 || !eff[0].Ready {
		t.Fatalf("expected transient ProbeFailed to preserve prior Ready status, got %+v", eff)
	}

	// Verify BootBarrier StartAfter waits until Release.
	barrier := NewBootBarrier()
	var ran atomic.Bool
	done := barrier.StartAfter(context.Background(), func(context.Context) {
		ran.Store(true)
	})
	time.Sleep(20 * time.Millisecond)
	if ran.Load() {
		t.Fatal("StartAfter callback ran before BootBarrier.Release()")
	}
	barrier.Release()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for StartAfter callback after Release")
	}
	if !ran.Load() {
		t.Fatal("expected StartAfter callback to run after Release")
	}
}

func TestMassFailureBreakerTripsAtFiftyPercentOfFiveRuntimes(t *testing.T) {
	names := []string{"claude", "codex", "gemini", "opencode", "grok", "ollama"}
	prev := make([]RuntimeStatus, len(names))
	for i, n := range names {
		prev[i] = RuntimeStatus{Runtime: n, Ready: true, Version: "1.0"}
	}

	breaker := MassFailureBreaker{MinRuntimes: 5}

	// 2 of 6 fail (<50%): breaker does NOT trip; the 2 dead runtimes become unready.
	passBelow := []ProbeObservation{
		{Status: prev[0], Outcome: ProbeReady},
		{Status: prev[1], Outcome: ProbeReady},
		{Status: prev[2], Outcome: ProbeReady},
		{Status: prev[3], Outcome: ProbeReady},
		{Status: RuntimeStatus{Runtime: "grok", Ready: false, Reason: "exit 1"}, Outcome: ProbeDead},
		{Status: RuntimeStatus{Runtime: "ollama", Ready: false, Reason: "exit 1"}, Outcome: ProbeDead},
	}
	effBelow, tripped := breaker.EvaluatePass(prev, passBelow)
	if tripped {
		t.Fatal("expected breaker NOT to trip when 2/6 (<50%) fail")
	}
	if len(ReadyRuntimes(effBelow)) != 4 {
		t.Fatalf("expected 4 ready runtimes when 2/6 are ProbeDead, got %v", ReadyRuntimes(effBelow))
	}

	// 3 of 6 fail (>=50% of >=5 runtimes): breaker trips and preserves prior Ready statuses.
	passMass := []ProbeObservation{
		{Status: prev[0], Outcome: ProbeReady},
		{Status: prev[1], Outcome: ProbeReady},
		{Status: prev[2], Outcome: ProbeReady},
		{Status: RuntimeStatus{Runtime: "opencode", Ready: false, Reason: "exit 1"}, Outcome: ProbeDead},
		{Status: RuntimeStatus{Runtime: "grok", Ready: false, Reason: "exit 1"}, Outcome: ProbeDead},
		{Status: RuntimeStatus{Runtime: "ollama", Ready: false, Reason: "exit 1"}, Outcome: ProbeDead},
	}
	effMass, tripped := breaker.EvaluatePass(prev, passMass)
	if !tripped {
		t.Fatal("expected MassFailureBreaker to trip when 3/6 (>=50% of >=5) fail in one pass")
	}
	if len(ReadyRuntimes(effMass)) != 6 {
		t.Fatalf("expected all 6 previously-ready runtimes preserved when breaker trips, got %v", ReadyRuntimes(effMass))
	}
}
