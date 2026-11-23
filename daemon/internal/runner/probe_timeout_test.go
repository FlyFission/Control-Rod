package runner

import (
	"context"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

// slowCLI answers --version with "mycli 1.0" until hang is set, then blocks until its context ends.
type slowCLI struct {
	mu   sync.Mutex
	hang bool
	gone bool
}

func (s *slowCLI) run(ctx context.Context, _ string, _ ...string) (string, int, error) {
	s.mu.Lock()
	hang, gone := s.hang, s.gone
	s.mu.Unlock()
	switch {
	case gone:
		return "error: not signed in", 1, nil
	case hang:
		<-ctx.Done()
		return "", -1, nil
	}
	return "mycli 1.0", 0, nil
}

func (s *slowCLI) set(hang, gone bool) {
	s.mu.Lock()
	s.hang, s.gone = hang, gone
	s.mu.Unlock()
}

func shortProbes(t *testing.T) {
	t.Helper()
	old := probeTimeout
	probeTimeout = 30 * time.Millisecond
	t.Cleanup(func() { probeTimeout = old })
}

func TestAProbeThatRanPastItsDeadlineIsMarkedTimedOut(t *testing.T) {
	stubArtifact(t)
	shortProbes(t)
	cli := &slowCLI{hang: true}
	if st := Probe(context.Background(), "mycli", "", cli.run); st.Ready || !st.timedOut {
		t.Fatalf("a hung version command must read as a timeout: %+v", st)
	}
	cli.set(false, true)
	if st := Probe(context.Background(), "mycli", "", cli.run); st.timedOut {
		t.Fatalf("a CLI that answered is not a timeout: %+v", st)
	}
	// A daemon shutting down cancels the parent context: that is not a slow host either.
	cli.set(true, false)
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(5 * time.Millisecond); cancel() }()
	if st := Probe(ctx, "mycli", "", cli.run); st.timedOut {
		t.Fatalf("a cancelled probe is not a timeout: %+v", st)
	}
}

func readyOf(d *Daemon, rt string) (bool, bool) {
	d.probeMu.Lock()
	defer d.probeMu.Unlock()
	for _, s := range d.status {
		if s.Runtime == rt {
			return s.Ready, true
		}
	}
	return false, false
}

func TestOneSlowProbeKeepsARuntimeOfferedButASecondOrASignOutDoesNot(t *testing.T) {
	stubArtifact(t)
	shortProbes(t)
	cli := &slowCLI{}
	d := New(Config{Home: t.TempDir(), Runtimes: []string{"mycli"}, Version: "test", Probe: cli.run,
		LookPath: func(string) (string, error) { return "/bin/true", nil },
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil))})
	ctx := context.Background()
	step := func(name string, want bool) {
		t.Helper()
		d.probe(ctx)
		if got, ok := readyOf(d, "mycli"); !ok || got != want {
			t.Fatalf("%s: ready = %v (seen %v), want %v", name, got, ok, want)
		}
	}
	step("first answer", true)
	cli.set(true, false)
	step("one timeout is held", true)
	step("a second timeout in a row is not", false)
	cli.set(false, false)
	step("an answer makes it ready again", true)
	cli.set(true, false)
	step("the grace is back after an answer", true)
	cli.set(false, true)
	step("a sign-out takes it away at once", false)
	cli.set(true, false)
	step("a timeout after not ready is not held", false)
}
