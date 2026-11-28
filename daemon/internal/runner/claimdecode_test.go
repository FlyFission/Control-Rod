package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// A job this daemon cannot read (here: a field a newer control plane added) fails its run at once
// with the reason, instead of waiting out the lease (review DMN-4).
func TestAJobTheDaemonCannotReadFailsItsRunAtOnce(t *testing.T) {
	api, _ := newFakeAPI(t)
	var served sync.Once
	var claimBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/runner/claim" {
			api.serve(w, r)
			return
		}
		body, _ := io.ReadAll(r.Body)
		sent := false
		served.Do(func() {
			claimBody = body
			sent = true
			_, _ = w.Write([]byte(`{"run":{"id":"run-newer","schema_version":"0.1.0","package_id":"WP-1","package_revision":1,"role":"author","round":1,"status":"running","queued_at":"2026-10-23T00:00:00Z","agent_baseline":"x","runtime":{"kind":"local","provider":"fake","model":"default"},"field_from_the_future":true},"inputs":[],"claim":{"token":"claim-newer","lease_expires_at":"2099-01-01T00:00:00Z","heartbeat_seconds":30}}`))
		})
		if !sent {
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer srv.Close()
	d := New(Config{API: srv.URL, Token: testToken, Home: t.TempDir(), Parallel: 1, Runtimes: []string{RuntimeFake}, Version: "test",
		PollInterval: 20 * time.Millisecond, Grace: time.Second, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()
	defer func() { cancel(); <-stopped }()
	select {
	case id := <-api.finished:
		if id != "run-newer" {
			t.Fatalf("finished %q", id)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("the run was never reported")
	}
	api.mu.Lock()
	comp := api.done["run-newer"]
	api.mu.Unlock()
	if comp.Status != "failed" || comp.Containment != "none" || comp.ClaimToken != "claim-newer" ||
		!strings.HasPrefix(comp.Error, "The daemon could not read this run's job, so nothing was started.") {
		t.Fatalf("completion %+v", comp)
	}
	var req map[string]any
	if json.Unmarshal(claimBody, &req) != nil || req["claim_protocol"] != float64(ClaimProtocol) {
		t.Fatalf("the claim did not say its protocol: %s", claimBody)
	}
}

// A control plane newer than the daemon refuses the claim with words that say what to do; the
// daemon logs them and runs nothing.
func TestAnOutdatedDaemonSaysWhatToDo(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"code":"daemon-outdated","message":"This daemon is older than Control Rod. Restart Control Rod."}`))
	}))
	defer srv.Close()
	var logs safeBuffer
	d := New(Config{API: srv.URL, Token: testToken, Home: t.TempDir(), Parallel: 1, Runtimes: []string{RuntimeFake}, Version: "test",
		PollInterval: 20 * time.Millisecond, Grace: time.Second, Logger: slog.New(slog.NewTextHandler(&logs, nil))})
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Millisecond)
	defer cancel()
	_ = d.Run(ctx)
	if !strings.Contains(logs.String(), "This daemon is older than Control Rod. Restart Control Rod.") {
		t.Fatalf("logs:\n%s", logs.String())
	}
}

type safeBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (s *safeBuffer) Write(p []byte) (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.b.Write(p)
}
func (s *safeBuffer) String() string { s.mu.Lock(); defer s.mu.Unlock(); return s.b.String() }
