package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestClaimRejectsInvalidRawWireBeforeStartingWork(t *testing.T) {
	for name, body := range map[string]string{
		"partial run":    `{"run":{"id":"x"},"inputs":[],"claim":{"token":"x","lease_expires_at":"2026-10-23T00:00:00Z","heartbeat_seconds":30}}`,
		"duplicate":      `{"run":{},"run":{},"inputs":[]}`,
		"trailing":       `{} {}`,
		"unsafe integer": `{"run":{"package_revision":9007199254740992}}`,
		"unknown field":  `{"unexpected":true}`,
	} {
		t.Run(name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, body) }))
			defer srv.Close()
			if job, err := NewClient(srv.URL, "token").Claim(context.Background(), []string{"fake"}, nil, 0); err == nil {
				t.Fatalf("admitted invalid job: %+v", job)
			}
		})
	}
}
func TestRunnerRejectsIncompleteSuccessReplies(t *testing.T) {
	for _, path := range []string{"log", "complete"} {
		t.Run(path, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{}`) }))
			defer srv.Close()
			c := NewClient(srv.URL, "token")
			if path == "log" {
				if _, err := c.Log(context.Background(), "run", LogBatch{}); err == nil {
					t.Fatal("accepted missing log fields")
				}
			} else {
				if _, err := c.Complete(context.Background(), "run", Completion{}); err == nil {
					t.Fatal("accepted missing receipt fields")
				}
			}
		})
	}
}

func TestClaimAcceptsCompleteGeneratedContract(t *testing.T) {
	body := `{"run":{"schema_version":"0.1.0","id":"x","package_id":"p","package_revision":0,"role":"author","agent_baseline":"a","runtime":{"kind":"local","provider":"fake","model":"default"},"round":1,"status":"running","queued_at":"2026-10-23T00:00:00Z"},"inputs":[],"claim":{"token":"t","lease_expires_at":"2026-10-23T00:00:00Z","heartbeat_seconds":30}}`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, body) }))
	defer srv.Close()
	if _, err := NewClient(srv.URL, "token").Claim(context.Background(), []string{"fake"}, nil, 0); err != nil {
		t.Fatal(err)
	}
}

func TestRunnerRequiresARecordedReceipt(t *testing.T) {
	for _, body := range []string{"", `{"run_id":"another","idempotency_key":"key","status":"succeeded","outputs":[],"received_at":"2026-10-23T00:00:00Z"}`} {
		t.Run(body, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if body == "" {
					w.WriteHeader(http.StatusNoContent)
				} else {
					fmt.Fprint(w, body)
				}
			}))
			defer srv.Close()
			if _, err := NewClient(srv.URL, "token").Complete(context.Background(), "run", Completion{IdempotencyKey: "key"}); err == nil {
				t.Fatal("accepted unrecorded or mismatched completion")
			}
		})
	}
}

// The claim tells the control plane the daemon's run time ceiling, which sizes budget reservations;
// with no ceiling the field is left out rather than sent as zero.
func TestClaimReportsTheRunTimeCeiling(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()
	if _, err := NewClient(srv.URL, "token").Claim(context.Background(), []string{"fake"}, nil, 45*time.Minute); err != ErrNoWork {
		t.Fatalf("claim: %v", err)
	}
	if got["run_timeout_seconds"] != float64(2700) {
		t.Fatalf("run_timeout_seconds = %v, want 2700", got["run_timeout_seconds"])
	}
	got = nil
	if _, err := NewClient(srv.URL, "token").Claim(context.Background(), []string{"fake"}, nil, 0); err != ErrNoWork {
		t.Fatalf("claim: %v", err)
	}
	if _, ok := got["run_timeout_seconds"]; ok {
		t.Fatalf("a missing ceiling was sent: %v", got)
	}
}
