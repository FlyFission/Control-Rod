package runner

import (
	"bytes"
	"context"
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

// A completion upload to a control plane that does not answer is cut short once the daemon shuts
// down, so a shutdown never waits minutes on it (review DMN-11). It stays in the outbox.
func TestAShutdownDoesNotWaitOnASlowCompletion(t *testing.T) {
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		select {
		case <-r.Context().Done():
		case <-release:
		}
	}))
	defer srv.Close()
	defer close(release)
	old := shutdownCompleteWait
	shutdownCompleteWait = 100 * time.Millisecond
	defer func() { shutdownCompleteWait = old }()
	home := t.TempDir()
	d := New(Config{API: srv.URL, Token: testToken, Home: home, Runtimes: []string{RuntimeFake}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	quit, cancel := context.WithCancel(context.Background())
	d.quit = quit
	done := make(chan struct{})
	start := time.Now()
	go func() { d.report("run-slow", "tok", Completion{Status: "failed", Outputs: []NamedFile{}}); close(done) }()
	time.Sleep(50 * time.Millisecond)
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the completion upload held the shutdown")
	}
	if took := time.Since(start); took > 3*time.Second {
		t.Fatalf("took %s", took)
	}
	if !d.outbox.HasDurable("run-slow") {
		t.Fatal("the completion was not kept in the outbox")
	}
}

// When the outbox could not keep a completion, the log says so instead of claiming it was kept
// (review DMN-12).
func TestTheLogSaysWhenTheOutboxCouldNotKeepACompletion(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { http.Error(w, "down", http.StatusServiceUnavailable) }))
	defer srv.Close()
	home := t.TempDir()
	// A file where the outbox folder goes: every outbox write fails.
	if err := os.WriteFile(filepath.Join(home, "outbox"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	var logs bytes.Buffer
	d := New(Config{API: srv.URL, Token: testToken, Home: home, Runtimes: []string{RuntimeFake}, CompleteRetries: 1,
		Logger: slog.New(slog.NewTextHandler(&logs, nil))})
	d.report("run-nowhere", "tok", Completion{Status: "failed", Outputs: []NamedFile{}})
	out := logs.String()
	if strings.Contains(out, "kept in the outbox") {
		t.Fatalf("the log claims the outbox kept it:\n%s", out)
	}
	if !strings.Contains(out, "the outbox could not keep it") {
		t.Fatalf("the log does not say the outbox failed:\n%s", out)
	}
}
