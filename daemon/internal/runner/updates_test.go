package runner

import (
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

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
)

type updateAPI struct {
	mu     sync.Mutex
	claims []map[string]json.RawMessage
	paths  []string
}

func (a *updateAPI) handler(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.paths = append(a.paths, r.URL.Path)
	if r.URL.Path == "/runner/claim" {
		var body map[string]json.RawMessage
		_ = json.NewDecoder(r.Body).Decode(&body)
		a.claims = append(a.claims, body)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	http.NotFound(w, r)
}

// Run starts the check once; claims carry nothing before it finishes, then each outdated agent
// (with npm_global, never command text), and an empty report reaches the API as []. The daemon
// calls no route but the claim.
func TestDaemonStartupCheckReachesTheClaim(t *testing.T) {
	api := &updateAPI{}
	srv := httptest.NewServer(http.HandlerFunc(api.handler))
	t.Cleanup(srv.Close)
	grok := agentupdate.Catalog[4]
	d := New(Config{
		API: srv.URL, Token: "t", Home: t.TempDir(), Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Container: &Container{}, PollInterval: 20 * time.Millisecond, Runtimes: []string{RuntimeFake},
		UpdateCheck: func(context.Context) []agentupdate.Status {
			return []agentupdate.Status{{Agent: grok, Installed: "1.0.77", Latest: "1.0.92",
				Command: []string{"npm", "install", "--global", "@xai-official/grok@1.0.92"}}}
		},
	})
	ctx := context.Background()

	// Before the startup check finishes, the claim carries no agent_updates at all.
	if _, err := d.client.Claim(ctx, nil, nil, 0, nil, d.updates.report()...); err != ErrNoWork {
		t.Fatal(err)
	}
	if _, ok := api.claims[0]["agent_updates"]; ok {
		t.Fatal("agent_updates sent before the check ran")
	}
	// Run starts the check; its claims then carry what it found.
	runCtx, stop := context.WithCancel(ctx)
	done := make(chan error, 1)
	go func() { done <- d.Run(runCtx) }()
	deadline := time.Now().Add(10 * time.Second)
	var got string
	for time.Now().Before(deadline) {
		api.mu.Lock()
		for _, c := range api.claims[1:] {
			if v, ok := c["agent_updates"]; ok {
				got = string(v)
			}
		}
		api.mu.Unlock()
		if got != "" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	stop()
	runErr := <-done
	if !strings.Contains(got, `"latest":"1.0.92"`) || !strings.Contains(got, `"npm_global":true`) || strings.Contains(got, "command") {
		t.Fatalf("claim after startup: %s (Run: %v, calls: %v)", got, runErr, api.paths)
	}
	// Nothing outdated any more: the report is [], so the app clears the card.
	d.updates.set(nil)
	_, _ = d.client.Claim(ctx, nil, nil, 0, nil, d.updates.report()...)
	api.mu.Lock()
	last := string(api.claims[len(api.claims)-1]["agent_updates"])
	api.mu.Unlock()
	if last != "[]" {
		t.Fatalf("empty report sent as %q", last)
	}
	for _, p := range api.paths {
		if p != "/runner/claim" {
			t.Fatalf("the daemon called %s", p)
		}
	}
}

// A check that could not finish for an agent keeps the update already known for it; a full check
// that finds it current clears it.
func TestAnIncompleteCheckKeepsAKnownUpdate(t *testing.T) {
	grok := agentupdate.Catalog[4]
	var u agentUpdates
	if u.report() != nil {
		t.Fatal("reported before the check")
	}
	u.set([]agentupdate.Status{{Agent: grok, Installed: "1.0.77", Latest: "1.0.92", Command: []string{"npm"}}})
	u.set([]agentupdate.Status{{Agent: grok, Installed: "1.0.77", Note: "latest version unavailable: timeout"}})
	if r := u.report(); len(r) != 1 || r[0].Latest != "1.0.92" {
		t.Fatalf("an incomplete check wiped the known update: %#v", r)
	}
	u.set([]agentupdate.Status{{Agent: grok, Installed: "1.0.92", Latest: "1.0.92"}})
	if r := u.report(); r == nil || len(r) != 0 {
		t.Fatalf("after a full check with nothing outdated: %#v", r)
	}
}
