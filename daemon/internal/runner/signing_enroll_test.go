package runner

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// A fresh install had no signing key, so every check it attested was voided ("the daemon signing
// key is not in the OS keychain") and no card could finish. The daemon now creates its key and
// offers it at start, retrying while the keychain or setup is not ready, until it is enrolled.
func TestDaemonEnrollsItsSigningKeyAtStart(t *testing.T) {
	old := enrollFirstWait
	enrollFirstWait = time.Millisecond
	t.Cleanup(func() { enrollFirstWait = old })

	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	want := PublicKeyBase64(priv.Public().(ed25519.PublicKey))
	var offers atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/runner/signing-key" || r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		var body struct {
			PublicKey string `json:"public_key"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.PublicKey != want {
			t.Errorf("offered %q, want %q", body.PublicKey, want)
		}
		status := "enrolled"
		switch offers.Add(1) {
		case 1:
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		case 2:
			status = "no-organization"
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"status": status})
	}))
	defer srv.Close()

	var keyCalls atomic.Int32
	d := New(Config{API: srv.URL, Token: "tok", Home: t.TempDir(), Runtimes: []string{"fake"}, SigningKey: func() (ed25519.PrivateKey, error) {
		if keyCalls.Add(1) == 1 {
			return nil, errors.New("keychain locked")
		}
		return priv, nil
	}})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	d.enrollSigningKey(ctx)
	if ctx.Err() != nil {
		t.Fatal("enrollment never finished")
	}
	if got := offers.Load(); got != 3 {
		t.Fatalf("want a refused offer, a wait for setup, then enrolled (3 offers), got %d", got)
	}
}

// Another key already enrolled is left to an administrator: the daemon stops offering.
func TestDaemonStopsWhenAnAdministratorMustEnroll(t *testing.T) {
	var offers atomic.Int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		offers.Add(1)
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "needs-admin"})
	}))
	defer srv.Close()
	_, priv, _ := ed25519.GenerateKey(rand.Reader)
	d := New(Config{API: srv.URL, Token: "tok", Home: t.TempDir(), Runtimes: []string{"fake"}, SigningKey: func() (ed25519.PrivateKey, error) { return priv, nil }})
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	d.enrollSigningKey(ctx)
	if ctx.Err() != nil || offers.Load() != 1 {
		t.Fatalf("want one offer and a stop, got %d offers (ctx %v)", offers.Load(), ctx.Err())
	}
}
