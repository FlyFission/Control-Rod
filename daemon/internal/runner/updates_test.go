package runner

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/flyfission/control-rod/daemon/internal/agentupdate"
)

type updateAPI struct {
	mu        sync.Mutex
	requested []AgentUpdateRequest
	takes     int
	claims    []map[string]json.RawMessage
}

func (a *updateAPI) handler(w http.ResponseWriter, r *http.Request) {
	a.mu.Lock()
	defer a.mu.Unlock()
	switch r.URL.Path {
	case "/runner/agent-updates/take":
		a.takes++
		_ = json.NewEncoder(w).Encode(map[string]any{"requests": a.requested})
		a.requested = nil
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
	var sink [][]string
	return updateDaemonChecked(t, api, latest, ran, &sink)
}

func updateDaemonChecked(t *testing.T, api *updateAPI, latest *string, ran *[]string, checked *[][]string) *Daemon {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(api.handler))
	t.Cleanup(srv.Close)
	grok := agentupdate.Catalog[4]
	return New(Config{
		API: srv.URL, Token: "t", Home: t.TempDir(), Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Container: &Container{},
		UpdateCheck: func(_ context.Context, only []string) []agentupdate.Status {
			*checked = append(*checked, only)
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
	// An agent the daemon has no command for, and a version other than the one it would install,
	// are refused, not run.
	api.requested = []AgentUpdateRequest{{"claude", "2.1.330"}, {"grok", "1.0.99"}}
	d.takeAgentUpdates(ctx)
	if len(ran) != 0 {
		t.Fatalf("ran %v for a version nobody signed", ran)
	}
	api.requested = []AgentUpdateRequest{{"grok", "1.0.92"}}
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
	api := &updateAPI{requested: []AgentUpdateRequest{{"grok", "1.0.92"}}}
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

// A job counts from the moment its claim returns, before its goroutine registers it as active.
func TestAgentUpdateWaitsForAClaimedJobNotYetActive(t *testing.T) {
	api := &updateAPI{requested: []AgentUpdateRequest{{"grok", "1.0.92"}}}
	latest := "1.0.92"
	var ran []string
	d := updateDaemon(t, api, &latest, &ran)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	d.inFlight.Add(1)
	d.takeAgentUpdates(ctx)
	if len(ran) != 0 || api.takes != 0 {
		t.Fatalf("updated with a claimed job in flight: ran %v, takes %d", ran, api.takes)
	}
}

// A run whose processes were not confirmed stopped keeps its receipt; no update runs under it,
// even when the receipt file cannot be read.
func TestAgentUpdateWaitsWhileAReceiptRemains(t *testing.T) {
	api := &updateAPI{requested: []AgentUpdateRequest{{"grok", "1.0.92"}}}
	latest := "1.0.92"
	var ran []string
	d := updateDaemon(t, api, &latest, &ran)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	if err := os.MkdirAll(d.receipts.dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(d.receipts.dir, "R-1.json"), []byte("not json"), 0o600); err != nil {
		t.Fatal(err)
	}
	d.takeAgentUpdates(ctx)
	if len(ran) != 0 || api.takes != 0 {
		t.Fatalf("updated while a receipt remained: ran %v, takes %d", ran, api.takes)
	}
}

// After an update only the agents just installed are checked again.
func TestAgentUpdateRechecksOnlyWhatItInstalled(t *testing.T) {
	api := &updateAPI{}
	latest := "1.0.92"
	var ran []string
	var checked [][]string
	d := updateDaemonChecked(t, api, &latest, &ran, &checked)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	api.requested = []AgentUpdateRequest{{"grok", "1.0.99"}}
	d.takeAgentUpdates(ctx)
	if len(checked) != 1 {
		t.Fatalf("checked again although nothing installed: %v", checked)
	}
	api.requested = []AgentUpdateRequest{{"grok", "1.0.92"}}
	d.takeAgentUpdates(ctx)
	if len(checked) != 2 || len(checked[1]) != 1 || checked[1][0] != "grok" {
		t.Fatalf("re-check scope: %v", checked)
	}
}
