//go:build unix

package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func claimedJob(id, script string) *Job {
	j := &Job{Run: testRun(id, "author"), Inputs: []NamedFile{
		{Name: "BRIEF.md", ContentBase64: b64("x")},
		{Name: "FAKE.sh", ContentBase64: b64(script)},
	}}
	j.Run.Runtime.Provider = "fake"
	j.Claim = RunClaim{Token: "claim-" + id, LeaseExpiresAt: time.Now().Add(time.Minute).Format(time.RFC3339), HeartbeatSeconds: 30}
	return j
}

func TestFinalFlushSendsEveryLineBeforeCompletion(t *testing.T) {
	job := claimedJob("run-final-logs", `i=0; while [ "$i" -lt 1201 ]; do echo "line-$i"; i=$((i+1)); done; echo report > out/report.md`)
	api, srv := newFakeAPI(t, job)
	d := custodyDaemon(t, srv, t.TempDir(), io.Discard)
	d.cfg.LogInterval = time.Hour // all output must travel through the final flush
	runUntil(t, d, api, 1)
	api.mu.Lock()
	defer api.mu.Unlock()
	seen := 0
	for _, batch := range api.logs[job.Run.ID] {
		if len(batch.Lines) > 500 {
			t.Fatalf("API would discard lines after 500 in a %d-line batch", len(batch.Lines))
		}
		for _, line := range batch.Lines {
			if line != fmt.Sprintf("line-%d", seen) {
				t.Fatalf("line %d: %q", seen, line)
			}
			seen++
		}
	}
	if seen != 1201 {
		t.Fatalf("uploaded %d lines, want 1201", seen)
	}
}

func custodyDaemon(t *testing.T, srv *httptest.Server, home string, logs io.Writer) *Daemon {
	t.Helper()
	return New(Config{
		API: srv.URL, Token: testToken, Home: home, Parallel: 1, Timeout: 30 * time.Second,
		PollInterval: 20 * time.Millisecond, LogInterval: 20 * time.Millisecond, Grace: 2 * time.Second,
		Heartbeat: 60 * time.Millisecond, RetryBase: 10 * time.Millisecond, CompleteRetries: 6, OutboxInterval: 50 * time.Millisecond,
		Runtimes: []string{RuntimeFake}, Version: "test", Logger: slog.New(slog.NewTextHandler(logs, nil)),
	})
}

func runUntil(t *testing.T, d *Daemon, api *fakeAPI, n int) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()
	api.wait(t, n)
	cancel()
	<-stopped
}

func TestHeartbeatsCarryTheClaimTokenWhileTheAgentIsQuiet(t *testing.T) {
	job := claimedJob("run-hb", "sleep 0.5")
	api, srv := newFakeAPI(t, job)
	runUntil(t, custodyDaemon(t, srv, t.TempDir(), io.Discard), api, 1)
	api.mu.Lock()
	defer api.mu.Unlock()
	empty := 0
	for _, b := range api.logs["run-hb"] {
		if b.ClaimToken != "claim-run-hb" {
			t.Errorf("log batch without the claim token: %+v", b)
		}
		if len(b.Lines) == 0 {
			empty++
		}
	}
	if empty < 3 {
		t.Errorf("want at least 3 empty heartbeats while quiet, got %d", empty)
	}
	if c := api.done["run-hb"]; c.ClaimToken != "claim-run-hb" || len(c.IdempotencyKey) < 16 {
		t.Errorf("completion custody %q %q", c.ClaimToken, c.IdempotencyKey)
	}
}

func TestCompletionIsRetriedWithTheSameKeyAndLeavesTheOutboxWhenRecorded(t *testing.T) {
	home := t.TempDir()
	job := claimedJob("run-retry", "echo hi > out/a.md")
	api, srv := newFakeAPI(t, job)
	api.failCompletes = 3
	runUntil(t, custodyDaemon(t, srv, home, io.Discard), api, 1)
	api.mu.Lock()
	defer api.mu.Unlock()
	tries := api.attempts["run-retry"]
	if len(tries) != 4 {
		t.Fatalf("want 4 attempts, got %d", len(tries))
	}
	for _, c := range tries {
		if c.IdempotencyKey != tries[0].IdempotencyKey {
			t.Errorf("retry changed the idempotency key")
		}
	}
	if left, _ := NewOutbox(home).List(); len(left) != 0 {
		t.Errorf("outbox still holds %d entries", len(left))
	}
}

func TestOutboxEntriesFromAnEarlierRunAreSentAtStart(t *testing.T) {
	home := t.TempDir()
	ob := NewOutbox(home)
	comp := Completion{ClaimToken: "claim-old", IdempotencyKey: "0123456789abcdef", Status: "succeeded", Outputs: []NamedFile{}}
	if err := ob.Put(OutboxEntry{RunID: "run-old", Completion: comp}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(home, "outbox", "run-old.json"))
	if err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("outbox file %v %v", info, err)
	}
	b, _ := os.ReadFile(filepath.Join(home, "outbox", "run-old.json"))
	if bytes.Contains(b, []byte(testToken)) {
		t.Error("the daemon token must never be written to the outbox")
	}
	api, srv := newFakeAPI(t)
	runUntil(t, custodyDaemon(t, srv, home, io.Discard), api, 1)
	api.mu.Lock()
	got := api.done["run-old"]
	api.mu.Unlock()
	if got.IdempotencyKey != comp.IdempotencyKey || got.ClaimToken != "claim-old" {
		t.Errorf("replayed %+v", got)
	}
	if left, _ := ob.List(); len(left) != 0 {
		t.Errorf("outbox still holds %d entries", len(left))
	}
}

func TestARefusedCompletionIsNotRetriedAndIsKeptAsEvidence(t *testing.T) {
	home := t.TempDir()
	job := claimedJob("run-refused", "true")
	api, srv := newFakeAPI(t, job)
	api.completeStatus = http.StatusConflict
	runUntil(t, custodyDaemon(t, srv, home, io.Discard), api, 1)
	time.Sleep(150 * time.Millisecond)
	api.mu.Lock()
	n := len(api.attempts["run-refused"])
	api.mu.Unlock()
	if n != 1 {
		t.Errorf("a refused completion was sent %d times", n)
	}
	if _, err := os.Stat(filepath.Join(home, "outbox", "refused", "run-refused.json")); err != nil {
		t.Errorf("refused completion not kept: %v", err)
	}
}

func TestARunTheControlPlaneNoLongerHoldsIsEnded(t *testing.T) {
	job := claimedJob("run-gone", "echo started; sleep 30")
	api, srv := newFakeAPI(t, job)
	api.gone["run-gone"] = true
	var logs bytes.Buffer
	start := time.Now()
	runUntil(t, custodyDaemon(t, srv, t.TempDir(), &logs), api, 1)
	if time.Since(start) > 10*time.Second {
		t.Fatal("the agent kept running after the control plane let go of the run")
	}
	api.mu.Lock()
	defer api.mu.Unlock()
	c := api.done["run-gone"]
	if c.Status != "failed" || !strings.Contains(c.Error, "run lost") {
		t.Errorf("completion %+v", c)
	}
	var raw map[string]any
	b, _ := json.Marshal(c)
	_ = json.Unmarshal(b, &raw)
	if raw["claim_token"] != "claim-run-gone" {
		t.Errorf("claim token missing from completion")
	}
}

func TestAStopFromTheOwnerEndsTheProcessAndCompletesAsStopped(t *testing.T) {
	job := claimedJob("run-stop", "echo working; sleep 30")
	api, srv := newFakeAPI(t, job)
	api.stop["run-stop"] = true
	start := time.Now()
	runUntil(t, custodyDaemon(t, srv, t.TempDir(), io.Discard), api, 1)
	if time.Since(start) > 10*time.Second {
		t.Fatal("the agent kept running after the owner stopped it")
	}
	api.mu.Lock()
	defer api.mu.Unlock()
	if c := api.done["run-stop"]; c.Status != "stopped" || c.Error != "stopped by the owner" {
		t.Errorf("completion %+v", c)
	}
}
