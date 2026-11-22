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
	mu        sync.Mutex
	requested []string
	takes     int
	claims    []map[string]json.RawMessage
}

func (a *updateAPI) handler(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	switch r.URL.Path {
	case "/runner/agent-updates/take":
		a.takes++
		_ = json.NewEncoder(w).Encode(map[string]any{"agents": a.requested})
		a.requested = []string{}
	case "/runner/claim":
		var body map[string]json.RawMessage
		_ = json.NewDecoder(r.Body).Decode(&body)
		a.claims = append(a.claims, body)
		w.WriteHeader(http.StatusNoContent)
	default:
		http.NotFound(w, r)
	}
}

func updateDaemon(t *testing.T, api *updateAPI, latest *string, ran *[]string) *Daemon {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(api.handler))
	t.Cleanup(srv.Close)
	grok := agentupdate.Catalog[4]
	return New(Config{
		API: srv.URL, Token: "t", Home: t.TempDir(), Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Container: &Container{},
		UpdateCheck: func(context.Context) []agentupdate.Status {
			return []agentupdate.Status{{Agent: grok, Installed: "1.0.77", Latest: *latest,
				Command: []string{"npm", "install", "--global", "@xai-official/grok@" + *latest}}}
		},
		UpdateRun: func(_ context.Context, name string, args []string) (string, error) {
			*ran = append(*ran, name+" "+strings.Join(args, " "))
			*latest = "1.0.77" // installed now matches: the re-check finds nothing outdated
			return "added 1 package", nil
		},
	})
}

func TestAgentUpdateRunsOnlyTheDaemonsOwnCommandWhenAsked(t *testing.T) {
	api := &updateAPI{}
	latest := "1.0.92"
	var ran []string
	d := updateDaemon(t, api, &latest, &ran)
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

	// Nobody asked: nothing runs.
	d.takeAgentUpdates(ctx)
	if len(ran) != 0 {
		t.Fatalf("ran %v without a request", ran)
	}
	// An agent the daemon has no command for is refused, not run.
	api.requested = []string{"claude", "grok"}
	d.takeAgentUpdates(ctx)
	if len(ran) != 1 || ran[0] != "npm install --global @xai-official/grok@1.0.92" {
		t.Fatalf("ran %v", ran)
	}
	rep := d.updates.report()
	if len(rep) != 1 {
		t.Fatalf("report after update: %+v", rep)
	}
	for _, a := range rep {
		switch a.Agent {
		case "claude":
			if a.LastAttempt == nil || a.LastAttempt.Outcome != "failed" {
				t.Fatalf("claude: %+v", a)
			}
		case "grok":
			t.Fatalf("grok is current after the update and must not be listed: %+v", a)
		}
	}
}

func TestAgentUpdateWaitsWhileARunIsActive(t *testing.T) {
	api := &updateAPI{requested: []string{"grok"}}
	latest := "1.0.92"
	var ran []string
	d := updateDaemon(t, api, &latest, &ran)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	d.activeMu.Lock()
	if d.active == nil {
		d.active = map[string]bool{}
	}
	d.active["run_1"] = true
	d.activeMu.Unlock()
	d.takeAgentUpdates(ctx)
	if len(ran) != 0 || api.takes != 0 {
		t.Fatalf("updated during a run: ran %v, takes %d", ran, api.takes)
	}
}
