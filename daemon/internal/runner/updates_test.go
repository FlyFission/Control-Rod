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

// The daemon reports what its startup check found, with the command a person can run, and never
// installs anything itself.
func TestAgentUpdatesAreReportedNeverRun(t *testing.T) {
	api := &updateAPI{}
	srv := httptest.NewServer(http.HandlerFunc(api.handler))
	t.Cleanup(srv.Close)
	grok := agentupdate.Catalog[4]
	d := New(Config{
		API: srv.URL, Token: "t", Home: t.TempDir(), Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Container: &Container{},
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
	d.checkAgentUpdates(ctx)
	_, _ = d.client.Claim(ctx, nil, nil, 0, nil, d.updates.report()...)
	if !strings.Contains(string(api.claims[1]["agent_updates"]), `"command":["npm","install","--global","@xai-official/grok@1.0.92"]`) {
		t.Fatalf("claim: %s", api.claims[1]["agent_updates"])
	}
	for _, p := range api.paths {
		if p != "/runner/claim" {
			t.Fatalf("the daemon called %s", p)
		}
	}
}

// An empty list is sent once the check finds nothing outdated, so the app clears the card.
func TestAgentUpdatesReportEmptyOnceCurrent(t *testing.T) {
	var u agentUpdates
	if u.report() != nil {
		t.Fatal("reported before the check")
	}
	u.set(nil)
	if r := u.report(); r == nil || len(r) != 0 {
		t.Fatalf("after a check with nothing outdated: %#v", r)
	}
}
