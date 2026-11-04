//go:build unix

package runner

import (
	"bytes"
	"context"
	"encoding/base64"
	"io"
	"log/slog"
	"slices"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// These tests cover the failure reported against another agent workbench (Kandev 0.98.0,
// 2026-10-30): an agent sends a finished reply, yet the session stays "running" for an hour
// because the turn never formally ends, background work keeps it open, and nothing reconciles it.

func settleDaemon(t *testing.T, srv string, home string, settle time.Duration) (context.CancelFunc, chan struct{}) {
	t.Helper()
	d := New(Config{
		API: srv, Token: testToken, Home: home, Parallel: 1, Timeout: 30 * time.Second, SettleAfter: settle,
		PollInterval: 20 * time.Millisecond, LogInterval: 20 * time.Millisecond, Grace: 2 * time.Second,
		StopAfterHangup: 100 * time.Millisecond, StopGrace: time.Second,
		Runtimes: []string{RuntimeFake}, Version: "test",
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
	})
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()
	t.Cleanup(func() { cancel(); <-stopped })
	return cancel, stopped
}

func runFake(t *testing.T, id, script string, settle time.Duration) (Completion, []Event, time.Duration) {
	t.Helper()
	job := &Job{Run: testRun(id, "author"), Inputs: []NamedFile{
		{Name: "BRIEF.md", ContentBase64: b64("x")},
		{Name: "FAKE.sh", ContentBase64: b64(script)},
	}}
	api, srv := newFakeAPI(t, job)
	start := time.Now()
	settleDaemon(t, srv.URL, t.TempDir(), settle)
	api.wait(t, 1)
	took := time.Since(start)
	api.mu.Lock()
	defer api.mu.Unlock()
	comp := api.done[id]
	var events []Event
	for _, b := range api.logs[id] {
		events = append(events, b.Events...)
	}
	events = append(events, comp.Events...)
	return comp, events, took
}

func hasNotice(events []Event, part string) bool {
	return slices.ContainsFunc(events, func(e Event) bool { return e.Kind == EvNotice && strings.Contains(e.Text, part) })
}

func TestARunThatReportedItsResultButDidNotExitEndsOnItsResult(t *testing.T) {
	script := `echo report > out/report.md
echo '{"type":"result","subtype":"success","is_error":false,"result":"Done."}'
sleep 60`
	comp, events, took := runFake(t, "run-settle", script, 300*time.Millisecond)
	if comp.Status != "succeeded" || comp.Error != "" {
		t.Fatalf("status %q error %q, want succeeded", comp.Status, comp.Error)
	}
	if took > 15*time.Second {
		t.Fatalf("took %s: the run waited on its process instead of its result", took)
	}
	if !slices.ContainsFunc(comp.Outputs, func(f NamedFile) bool { return f.Name == "report.md" }) {
		t.Fatalf("outputs %+v, want report.md", comp.Outputs)
	}
	if !hasNotice(events, "did not exit") {
		t.Fatalf("no notice says why the daemon ended the run: %+v", events)
	}
}

func TestAFailedResultThatDidNotExitEndsFailed(t *testing.T) {
	script := `echo '{"type":"result","subtype":"error_during_execution","is_error":true,"result":"boom"}'
sleep 60`
	comp, _, _ := runFake(t, "run-settle-failed", script, 300*time.Millisecond)
	if comp.Status != "failed" || !strings.Contains(comp.Error, "failed result") {
		t.Fatalf("status %q error %q, want failed with the reported result", comp.Status, comp.Error)
	}
}

func TestACodexTurnThatCompletedButDidNotExitEndsOnItsResult(t *testing.T) {
	script := `echo report > out/report.md
echo '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'
sleep 60`
	comp, _, _ := runFake(t, "run-settle-codex", script, 300*time.Millisecond)
	if comp.Status != "succeeded" {
		t.Fatalf("status %q error %q, want succeeded", comp.Status, comp.Error)
	}
}

func TestBackgroundWorkLeftByAFinishedRunIsEnded(t *testing.T) {
	script := `sleep 60 &
echo $! > out/child.pid
echo '{"type":"result","subtype":"success","result":"Done."}'
wait`
	comp, _, _ := runFake(t, "run-settle-bg", script, 300*time.Millisecond)
	if comp.Status != "succeeded" {
		t.Fatalf("status %q error %q", comp.Status, comp.Error)
	}
	var pidText string
	for _, f := range comp.Outputs {
		if f.Name == "child.pid" {
			b, err := decodeB64(f.ContentBase64)
			if err != nil {
				t.Fatal(err)
			}
			pidText = string(b)
		}
	}
	pid, err := strconv.Atoi(strings.TrimSpace(pidText))
	if err != nil {
		t.Fatalf("child pid %q: %v", pidText, err)
	}
	deadline := time.Now().Add(3 * time.Second)
	for syscall.Kill(pid, 0) == nil {
		if time.Now().After(deadline) {
			t.Fatalf("background child %d outlived its finished run", pid)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestARunThatExitsAfterItsResultIsUntouched(t *testing.T) {
	script := `echo '{"type":"result","subtype":"success","result":"Done."}'
sleep 0.2
exit 3`
	comp, events, _ := runFake(t, "run-settle-exit", script, 5*time.Second)
	// The process's own exit decides, so a non-zero exit still fails the run.
	if comp.Status != "failed" || comp.Error != "agent exited with status 3" {
		t.Fatalf("status %q error %q", comp.Status, comp.Error)
	}
	if hasNotice(events, "did not exit") {
		t.Fatal("a run that exited on its own was reported as ended by the daemon")
	}
}

func TestTurnEndReadsOnlyTheRuntimesFinalReport(t *testing.T) {
	for _, c := range []struct {
		line          string
		ended, failed bool
	}{
		{`{"type":"result","subtype":"success","is_error":false,"result":"ok"}`, true, false},
		{`{"type":"result","subtype":"error_max_turns","result":"x"}`, true, true},
		{`{"type":"result","is_error":true}`, true, true},
		{`{"type":"turn.completed","usage":{}}`, true, false},
		{`{"type":"turn.failed","error":{"message":"x"}}`, true, true},
		{`{"type":"assistant","message":{"content":[{"type":"text","text":"{\"type\":\"result\"}"}]}}`, false, false},
		{`{"type":"user","message":{"content":[{"type":"tool_result","content":"turn.completed result"}]}}`, false, false},
		{`[stderr] {"type":"result"}`, false, false},
		{`not json "result"`, false, false},
	} {
		ended, failed := TurnEnd(c.line)
		if ended != c.ended || failed != c.failed {
			t.Errorf("%s: got ended=%v failed=%v, want %v %v", c.line, ended, failed, c.ended, c.failed)
		}
	}
}

// --- environment ----------------------------------------------------------------------------

func TestChildEnvDropsWhatThePackageManagerLauncherSet(t *testing.T) {
	// Recorded from `pnpm run` (pnpm 10.28.0), which is how `pnpm cr` starts the daemon.
	in := []string{
		"HOME=/h", "LANG=C.UTF-8", "NODE_EXTRA_CA_CERTS=/ca.pem", "NPM_CONFIG_REGISTRY=https://r.example/",
		"INIT_CWD=/repo", "PNPM_SCRIPT_SRC_DIR=/repo", "PNPM_HOME=/h/.pnpm",
		"npm_command=run-script", "npm_config_globalconfig=/h/.config/pnpm/rc", "npm_config_prefix=/tmp/x",
		"npm_config_user_agent=pnpm/10.28.0", "npm_execpath=/p/pnpm.cjs", "npm_lifecycle_event=cr",
		"npm_lifecycle_script=node scripts/cr.mjs", "npm_node_execpath=/n/node", "npm_package_json=/repo/package.json",
		"npm_package_name=control-rod", "pnpm_config_verify_deps_before_run=false",
		"PATH=/repo/node_modules/.bin:/p/pnpm/dist/node-gyp-bin:/repo/.bin:/usr/local/bin:/usr/bin",
		"CONTROLROD_DAEMON_TOKEN=" + testToken,
	}
	got := ChildEnv(in)
	want := []string{
		"HOME=/h", "LANG=C.UTF-8", "NODE_EXTRA_CA_CERTS=/ca.pem", "NPM_CONFIG_REGISTRY=https://r.example/", "PNPM_HOME=/h/.pnpm",
		"PATH=/repo/.bin:/usr/local/bin:/usr/bin",
	}
	if !slices.Equal(got, want) {
		t.Fatalf("child env\n got %q\nwant %q", got, want)
	}
}

func TestClaudeRunsCannotStartBackgroundTasks(t *testing.T) {
	ws := &Workspace{Dir: t.TempDir(), Inputs: t.TempDir()}
	t.Setenv("CLAUDE_CODE_DISABLE_BACKGROUND_TASKS", "0")
	run := testRun("run-env", "author")
	cmd, err := Command(RuntimeClaude, run, ws)
	if err != nil {
		t.Fatal(err)
	}
	if v := envValue(cmd.Env, "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS"); v != "1" {
		t.Fatalf("CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=%q in a Claude run, want 1 (once)", v)
	}
	cmd, err = Command(RuntimeCodex, run, ws)
	if err != nil {
		t.Fatal(err)
	}
	if v := envValue(cmd.Env, "CLAUDE_CODE_DISABLE_BACKGROUND_TASKS"); v != "0" {
		t.Fatalf("a Codex run's environment was changed: %q", v)
	}
}

// envValue is the value a child sees: duplicates are an error here, not "last one wins".
func envValue(env []string, key string) string {
	v, n := "", 0
	for _, kv := range env {
		if k, val, _ := strings.Cut(kv, "="); k == key {
			v, n = val, n+1
		}
	}
	if n > 1 {
		return "duplicate"
	}
	return v
}

// --- retries --------------------------------------------------------------------------------

func TestRetryGateDoublesTheWaitUpToItsLimitAndForgetsOnSuccess(t *testing.T) {
	g := newRetryGate(time.Second, 5*time.Second)
	now := time.Unix(1_800_000_000, 0)
	if !g.due("a", now) {
		t.Fatal("a key never tried is due")
	}
	var waits []time.Duration
	for i := 0; i < 5; i++ {
		n, w := g.failed("a", now)
		if n != i+1 {
			t.Fatalf("failure count %d, want %d", n, i+1)
		}
		waits = append(waits, w)
		if g.due("a", now.Add(w-time.Millisecond)) || !g.due("a", now.Add(w)) {
			t.Fatalf("attempt %d: due before or not due at its wait %s", i+1, w)
		}
	}
	if want := []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 5 * time.Second, 5 * time.Second}; !slices.Equal(waits, want) {
		t.Fatalf("waits %v, want %v", waits, want)
	}
	if !g.due("b", now) {
		t.Fatal("one key's failures delayed another")
	}
	g.forget("a")
	if !g.due("a", now) {
		t.Fatal("a success did not clear the wait")
	}
}

func TestACompletionTheControlPlaneKeepsFailingIsRetriedLessOftenAndKept(t *testing.T) {
	job := &Job{Run: testRun("run-poison", "author"), Inputs: []NamedFile{
		{Name: "BRIEF.md", ContentBase64: b64("x")},
		{Name: "FAKE.sh", ContentBase64: b64("echo ok")},
	}}
	api, srv := newFakeAPI(t, job)
	api.failCompletes = 1 << 30
	home := t.TempDir()
	var logs bytes.Buffer
	d := New(Config{
		API: srv.URL, Token: testToken, Home: home, Parallel: 1, Timeout: 30 * time.Second,
		PollInterval: 20 * time.Millisecond, LogInterval: 20 * time.Millisecond, Grace: time.Second,
		CompleteRetries: 1, OutboxInterval: 20 * time.Millisecond, RetryBase: 10 * time.Millisecond,
		Runtimes: []string{RuntimeFake}, Version: "test",
		Logger: slog.New(slog.NewTextHandler(&logs, nil)),
	})
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()
	time.Sleep(2 * time.Second)
	cancel()
	<-stopped
	api.mu.Lock()
	tries := len(api.attempts["run-poison"])
	api.mu.Unlock()
	// Every 20 ms for 2 s would be about 100 tries; doubling from 20 ms leaves about 7.
	if tries < 2 || tries > 15 {
		t.Fatalf("%d completion attempts in 2 s, want a few spaced by a doubling wait", tries)
	}
	if !NewOutbox(home).HasDurable("run-poison") {
		t.Fatal("a completion the control plane never recorded left the outbox")
	}
	if !strings.Contains(logs.String(), "next try in") {
		t.Fatalf("retry log does not say when it tries next:\n%s", logs.String())
	}
}

func decodeB64(s string) ([]byte, error) { return base64.StdEncoding.DecodeString(s) }
