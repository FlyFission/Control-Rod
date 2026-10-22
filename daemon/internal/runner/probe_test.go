package runner

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"slices"
	"strings"
	"testing"
	"time"
)

// scripted answers probe commands from a table keyed by the command line; anything else fails.
type scripted struct {
	answers map[string]struct {
		out  string
		code int
	}
	calls []string
}

func (s *scripted) run(_ context.Context, name string, args ...string) (string, int, error) {
	line := strings.Join(append([]string{name}, args...), " ")
	s.calls = append(s.calls, line)
	a, ok := s.answers[line]
	if !ok {
		return "", -1, errors.New("not found")
	}
	return a.out, a.code, nil
}

func answers(m map[string]struct {
	out  string
	code int
}) *scripted {
	return &scripted{answers: m}
}

type ans = struct {
	out  string
	code int
}

const loginHelp = "Manage login\n\nUsage: codex login [OPTIONS] [COMMAND]\n\nCommands:\n  status  Show login status\n  help    Print this message\n"

func TestProbeRefusesARuntimeWhoseVersionDoesNotAnswer(t *testing.T) {
	s := answers(map[string]ans{"claude --version": {"segfault", 139}})
	st := Probe(context.Background(), RuntimeClaude, "", s.run)
	if st.Ready || !strings.Contains(st.Reason, "did not answer") {
		t.Fatalf("got %+v", st)
	}
	ok := Probe(context.Background(), RuntimeClaude, "", answers(map[string]ans{"claude --version": {"2.1.0 (Claude Code)\n", 0}}).run)
	if !ok.Ready || ok.Version != "2.1.0 (Claude Code)" || ok.LoginChecked {
		t.Fatalf("got %+v", ok)
	}
}

func TestProbeChecksTheCodexLoginOnlyWhenTheCLIOffersAStatusCommand(t *testing.T) {
	out := answers(map[string]ans{
		"codex --version":    {"codex-cli 0.163.0", 0},
		"codex login --help": {loginHelp, 0},
		"codex login status": {"Not logged in", 1},
	})
	st := Probe(context.Background(), RuntimeCodex, "", out.run)
	if st.Ready || !st.LoginChecked || !strings.Contains(st.Reason, "not signed in") {
		t.Fatalf("logged out: %+v", st)
	}
	in := answers(map[string]ans{
		"codex --version":    {"codex-cli 0.163.0", 0},
		"codex login --help": {loginHelp, 0},
		"codex login status": {"Logged in using ChatGPT", 0},
	})
	if st := Probe(context.Background(), RuntimeCodex, "", in.run); !st.Ready || !st.LoginChecked {
		t.Fatalf("logged in: %+v", st)
	}
	noStatus := answers(map[string]ans{
		"codex --version":    {"codex-cli 0.163.0", 0},
		"codex login --help": {"Usage: codex login [OPTIONS]\n\nOptions:\n  --api-key\n", 0},
	})
	st = Probe(context.Background(), RuntimeCodex, "", noStatus.run)
	if !st.Ready || st.LoginChecked {
		t.Fatalf("no status command: %+v", st)
	}
	allowed := []string{"codex --version", "codex login --help", "codex login status"}
	for _, c := range append(append(out.calls, in.calls...), noStatus.calls...) {
		if !slices.Contains(allowed, c) {
			t.Errorf("probe ran %q; it may only ask, never sign in", c)
		}
	}
}

func TestTheDaemonOffersOnlyReadyRuntimesAndReportsTheRest(t *testing.T) {
	api, srv := newFakeAPI(t)
	s := answers(map[string]ans{"codex --version": {"codex-cli 0.163.0", 0}, "codex login --help": {loginHelp, 0}, "codex login status": {"Not logged in", 1}})
	d := New(Config{
		API: srv.URL, Token: testToken, Home: t.TempDir(), PollInterval: 20 * time.Millisecond,
		Runtimes: []string{RuntimeCodex, RuntimeFake}, Version: "test", Probe: s.run,
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()
	deadline := time.Now().Add(5 * time.Second)
	var req ClaimRequest
	for time.Now().Before(deadline) {
		api.mu.Lock()
		n := len(api.bodies)
		var last []byte
		if n > 0 {
			last = api.bodies[n-1]
		}
		api.mu.Unlock()
		if last != nil && json.Unmarshal(last, &req) == nil && req.RuntimeStatus != nil {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	<-stopped
	if !slices.Equal(req.Runtimes, []string{RuntimeFake}) {
		t.Errorf("offered %v, want only fake", req.Runtimes)
	}
	if len(req.RuntimeStatus) != 2 || req.RuntimeStatus[0].Ready || !strings.Contains(req.RuntimeStatus[0].Reason, "not signed in") {
		t.Errorf("status %+v", req.RuntimeStatus)
	}
}
