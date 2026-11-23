package runner

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

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

// fakeHost is the host an update test runs on: grok installed at one version, the registry at
// another, and every probe command recorded.
type fakeHost struct {
	mu        sync.Mutex
	installed string
	latest    string
	ran       []string
	failRun   bool
}

func updateDaemon(t *testing.T, api *updateAPI, latest *string, ran *[]string) *Daemon {
	h := &fakeHost{installed: "1.0.77", latest: *latest}
	d := hostDaemon(t, api, h)
	t.Cleanup(func() { *ran = h.ran })
	// The tests below read ran directly, so mirror it on every run.
	run := d.cfg.UpdateRun
	d.cfg.UpdateRun = func(ctx context.Context, name string, args []string) (string, error) {
		out, err := run(ctx, name, args)
		*ran = append([]string(nil), h.ran...)
		return out, err
	}
	return d
}

func hostDaemon(t *testing.T, api *updateAPI, h *fakeHost) *Daemon {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(api.handler))
	t.Cleanup(srv.Close)
	grok := agentupdate.Catalog[4]
	return New(Config{
		API: srv.URL, Token: "t", Home: t.TempDir(), Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Container: &Container{},
		Runtimes:  []string{RuntimeClaude, RuntimeCodex, RuntimeGrok},
		Probe: func(context.Context, string, ...string) (string, int, error) {
			return "", 127, errors.New("not installed in this test")
		},
		UpdateCheck: func(_ context.Context, only []string) []agentupdate.Status {
			h.mu.Lock()
			defer h.mu.Unlock()
			return []agentupdate.Status{{Agent: grok, Installed: h.installed, Latest: h.latest,
				Command: []string{"npm", "install", "--global", "@xai-official/grok@" + h.latest}}}
		},
		UpdateRun: func(_ context.Context, name string, args []string) (string, error) {
			h.mu.Lock()
			defer h.mu.Unlock()
			h.ran = append(h.ran, name+" "+strings.Join(args, " "))
			if h.failRun {
				return "npm error EACCES", errors.New("exit status 243")
			}
			h.installed = h.latest
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

// A job counts from the moment its claim returns, before its goroutine registers it as active:
// startJob is what the claim loop calls.
func TestAgentUpdateWaitsForAClaimedJobNotYetActive(t *testing.T) {
	api := &updateAPI{requested: []AgentUpdateRequest{{"grok", "1.0.92"}}}
	latest := "1.0.92"
	var ran []string
	d := updateDaemon(t, api, &latest, &ran)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	release, done := make(chan struct{}), make(chan struct{})
	d.startJob(func() { <-release })
	d.takeAgentUpdates(ctx)
	if len(ran) != 0 || api.takes != 0 {
		t.Fatalf("updated with a claimed job in flight: ran %v, takes %d", ran, api.takes)
	}
	go func() {
		for d.inFlight.Load() != 0 {
			time.Sleep(time.Millisecond)
		}
		close(done)
	}()
	close(release)
	<-done
	d.takeAgentUpdates(ctx)
	if len(ran) != 1 {
		t.Fatalf("did not update once the job finished: %v", ran)
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

// After an update only the runtime whose command ran is probed again, a failed command included;
// a refused request probes nothing.
func TestAgentUpdateProbesOnlyWhatItRan(t *testing.T) {
	api := &updateAPI{}
	h := &fakeHost{installed: "1.0.77", latest: "1.0.92", failRun: true}
	d := hostDaemon(t, api, h)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	mark := func() {
		d.probeMu.Lock()
		d.status = []RuntimeStatus{{Runtime: RuntimeClaude, Reason: "kept"}, {Runtime: RuntimeCodex, Reason: "kept"}, {Runtime: RuntimeGrok, Reason: "kept"}}
		d.probeMu.Unlock()
	}
	reasons := func() map[string]string {
		out := map[string]string{}
		for _, s := range d.runtimeStatus() {
			out[s.Runtime] = s.Reason
		}
		return out
	}
	mark()
	api.requested = []AgentUpdateRequest{{"grok", "1.0.99"}}
	d.takeAgentUpdates(ctx)
	for rt, r := range reasons() {
		if r != "kept" {
			t.Fatalf("probed %s although nothing ran", rt)
		}
	}
	api.requested = []AgentUpdateRequest{{"grok", "1.0.92"}}
	d.takeAgentUpdates(ctx)
	got := reasons()
	if len(h.ran) != 1 || got[RuntimeGrok] == "kept" || got[RuntimeClaude] != "kept" || got[RuntimeCodex] != "kept" {
		t.Fatalf("after a failed grok install: ran %v, statuses %v", h.ran, got)
	}
}

// Someone updated the CLI by hand past the version an administrator signed for: the daemon checks
// again just before installing and refuses the older target.
func TestAgentUpdateNeverDowngrades(t *testing.T) {
	api := &updateAPI{}
	h := &fakeHost{installed: "1.0.77", latest: "1.0.92"}
	d := hostDaemon(t, api, h)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	h.mu.Lock()
	h.installed = "1.0.95" // upgraded by hand; the registry still says 1.0.92
	h.mu.Unlock()
	api.requested = []AgentUpdateRequest{{"grok", "1.0.92"}}
	d.takeAgentUpdates(ctx)
	if len(h.ran) != 0 {
		t.Fatalf("installed an older version over a newer one: %v", h.ran)
	}
}

// With nothing to check an unconfirmed run by, updates wait for a restart.
func TestAgentUpdateWaitsForARestartAfterAnUnknownStop(t *testing.T) {
	api := &updateAPI{requested: []AgentUpdateRequest{{"grok", "1.0.92"}}}
	h := &fakeHost{installed: "1.0.77", latest: "1.0.92"}
	d := hostDaemon(t, api, h)
	ctx := context.Background()
	d.checkAgentUpdates(ctx)
	d.noteUncontained("R-2")
	d.takeAgentUpdates(ctx)
	if len(h.ran) != 0 || api.takes != 0 {
		t.Fatalf("updated after an unknown stop: ran %v", h.ran)
	}
}
