package runner

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
)

// The control plane writes a new daemon.token each time it starts. A daemon that read its token from
// that file must pick up the new one after a 401, not be refused until someone restarts it. Found by
// the live break pass: "the control plane restarts ... and work still runs".
func TestClientRereadsTokenFileAfterUnauthorized(t *testing.T) {
	var current atomic.Value
	current.Store("old-token")
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("Authorization") != "Bearer "+current.Load().(string) {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()
	file := filepath.Join(t.TempDir(), "daemon.token")
	if err := os.WriteFile(file, []byte("old-token\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	c := NewClient(srv.URL, "old-token").WithTokenFile(file)
	if _, err := c.Claim(context.Background(), []string{"fake"}, nil, 0, nil); !errors.Is(err, ErrNoWork) {
		t.Fatalf("first claim: %v", err)
	}
	// The control plane restarts with a new token.
	current.Store("new-token")
	if err := os.WriteFile(file, []byte("new-token\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	before := calls.Load()
	if _, err := c.Claim(context.Background(), []string{"fake"}, nil, 0, nil); !errors.Is(err, ErrNoWork) {
		t.Fatalf("claim after restart: %v", err)
	}
	if got := calls.Load() - before; got != 2 {
		t.Fatalf("want one refused call and one retry, got %d calls", got)
	}
}

// A token given in the environment has no file to re-read: a 401 stays a 401, once.
func TestClientWithoutTokenFileDoesNotRetry(t *testing.T) {
	var calls atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()
	c := NewClient(srv.URL, "env-token")
	if _, err := c.Claim(context.Background(), []string{"fake"}, nil, 0, nil); err == nil {
		t.Fatal("want an error")
	}
	if calls.Load() != 1 {
		t.Fatalf("want 1 call, got %d", calls.Load())
	}
}
