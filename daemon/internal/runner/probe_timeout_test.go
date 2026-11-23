package runner

import (
	"context"
	"io"
	"log/slog"
	"strings"
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

	// Grace resets on an answer while the runtime stays offered the whole time.
	cli.set(false, false)
	step("ready again", true)
	cli.set(true, false)
	step("timeout held", true)
	cli.set(false, false)
	step("answer while held", true)
	cli.set(true, false)
	step("a timeout after that answer is held again", true)
	step("and a second one in a row is not", false)
}

// hangsOnLogin answers codex --version and blocks on every login command until its context ends.
func hangsOnLogin(onHang func()) CommandRunner {
	return func(ctx context.Context, _ string, args ...string) (string, int, error) {
		if len(args) > 0 && args[0] == "login" {
			if onHang != nil {
				onHang()
			}
			<-ctx.Done()
			return "", -1, nil
		}
		return "codex-cli 0.163.0", 0, nil
	}
}

func TestACodexLoginCheckThatTimesOutIsNeverReady(t *testing.T) {
	stubArtifact(t)
	shortProbes(t)
	st := Probe(context.Background(), RuntimeCodex, "", hangsOnLogin(nil))
	if st.Ready || !st.timedOut || st.LoginChecked {
		t.Fatalf("a login help that ran out of time must not read as ready: %+v", st)
	}
	// Help answers and lists status; the status command hangs. Unknown, not signed out.
	hangsOnStatus := func(ctx context.Context, _ string, args ...string) (string, int, error) {
		switch strings.Join(args, " ") {
		case "--version":
			return "codex-cli 0.163.0", 0, nil
		case "login --help":
			return "Commands:\n  status  Show login status\n", 0, nil
		}
		<-ctx.Done()
		return "", -1, nil
	}
	st = Probe(context.Background(), RuntimeCodex, "", hangsOnStatus)
	if st.Ready || !st.timedOut || strings.Contains(st.Reason, "not signed in") || !strings.Contains(st.Reason, "did not answer in time") {
		t.Fatalf("a login status that ran out of time is unknown, not ready and not a sign-out: %+v", st)
	}
}

func TestASignOutAtTheDeadlineIsASignOut(t *testing.T) {
	stubArtifact(t)
	shortProbes(t)
	run := func(ctx context.Context, _ string, args ...string) (string, int, error) {
		switch strings.Join(args, " ") {
		case "--version":
			return "codex-cli 0.163.0", 0, nil
		case "login --help":
			return "Commands:\n  status  Show login status\n", 0, nil
		}
		// Exits on its own with "not signed in", just as the deadline passes.
		<-ctx.Done()
		return "Not logged in", 1, nil
	}
	st := Probe(context.Background(), RuntimeCodex, "", run)
	if st.Ready || st.timedOut || !strings.Contains(st.Reason, "not signed in") {
		t.Fatalf("an answer at the deadline is an answer: %+v", st)
	}
}

func TestACodexSignOutTakesItAwayAtOnce(t *testing.T) {
	stubArtifact(t)
	signedIn := true
	run := func(_ context.Context, _ string, args ...string) (string, int, error) {
		switch strings.Join(args, " ") {
		case "--version":
			return "codex-cli 0.163.0", 0, nil
		case "login --help":
			return "Usage: codex login\n\nCommands:\n  status  Show login status\n", 0, nil
		case "login status":
			if signedIn {
				return "Logged in using ChatGPT", 0, nil
			}
			return "Not logged in", 1, nil
		}
		return "", 1, nil
	}
	ready := Probe(context.Background(), RuntimeCodex, "", run)
	if !ready.Ready || !ready.LoginChecked {
		t.Fatalf("setup: a signed-in Codex must probe ready with its login checked: %+v", ready)
	}
	signedIn = false
	out := Probe(context.Background(), RuntimeCodex, "", run)
	if out.Ready || out.timedOut || !strings.Contains(out.Reason, "not signed in") {
		t.Fatalf("a sign-out is an answer, not a timeout: %+v", out)
	}
	// The daemon's grace only holds a timeout, so this answer takes Codex away on this pass.
	// (A daemon-level pass for Codex also runs its sandbox preflight, which this host cannot.)
	d := New(Config{Home: t.TempDir(), Runtimes: []string{RuntimeCodex}, Version: "test", Probe: run,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	if _, held := d.holdThroughTimeout(RuntimeCodex, out, ready); held {
		t.Fatal("a sign-out must not be held through the timeout grace")
	}
}

func TestAWithdrawalDuringASlowProbeIsNotUndoneByTheGrace(t *testing.T) {
	stubArtifact(t)
	shortProbes(t)
	cli := &slowCLI{}
	var d *Daemon
	withdraw := false
	run := func(ctx context.Context, name string, args ...string) (string, int, error) {
		if withdraw {
			d.markNotReady("mycli", "mycli no longer matches the version that was probed")
		}
		return cli.run(ctx, name, args...)
	}
	d = New(Config{Home: t.TempDir(), Runtimes: []string{"mycli"}, Version: "test", Probe: run,
		LookPath: func(string) (string, error) { return "/bin/true", nil },
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil))})
	d.probe(context.Background())
	if got, _ := readyOf(d, "mycli"); !got {
		t.Fatal("setup: mycli should be ready")
	}
	withdraw = true
	cli.set(true, false)
	d.probe(context.Background())
	if got, _ := readyOf(d, "mycli"); got {
		t.Fatal("a launch withdrew mycli during the pass; the timeout grace must not offer it again")
	}
}
