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
	if _, err := d.client.Claim(ctx, nil, nil, 0, nil, d.updates.report(nil)...); err != ErrNoWork {
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
	_, _ = d.client.Claim(ctx, nil, nil, 0, nil, d.updates.report(nil)...)
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

// A check that could not finish for an agent keeps the update already known for it and names the
// agent as unchecked, so a control plane that knew more keeps its own row; a full check that finds
// it current clears it.
func TestAnIncompleteCheckKeepsAKnownUpdate(t *testing.T) {
	grok := agentupdate.Catalog[4]
	var u agentUpdates
	if u.report(nil) != nil {
		t.Fatal("reported before the check")
	}
	u.set([]agentupdate.Status{{Agent: grok, Installed: "1.0.77", Latest: "1.0.92", Command: []string{"npm"}}})
	u.set([]agentupdate.Status{{Agent: grok, Installed: "1.0.77", Note: "latest version unavailable: timeout"}})
	if r := u.report(nil); len(r) != 1 || len(r[0].List) != 1 || r[0].List[0].Latest != "1.0.92" || uncheckedIDs(r[0].Unchecked) != "grok@1.0.77" {
		t.Fatalf("an incomplete check wiped the known update: %#v", r)
	}
	u.set([]agentupdate.Status{{Agent: grok, Installed: "1.0.92", Latest: "1.0.92"}})
	if r := u.report(nil); len(r) != 1 || len(r[0].List) != 0 || len(r[0].Unchecked) != 0 {
		t.Fatalf("after a full check with nothing outdated: %#v", r)
	}
}

// A fresh daemon (nothing kept) whose check cannot finish reports the agent as unchecked rather
// than as current; an installed version that is not strict SemVer (too long, or with build
// metadata) counts as unchecked too; agy is never reported.
func TestAFreshDaemonsIncompleteCheckIsUnchecked(t *testing.T) {
	claude, agy, grok := agentupdate.Catalog[0], agentupdate.Catalog[2], agentupdate.Catalog[4]
	var u agentUpdates
	u.set([]agentupdate.Status{
		{Agent: grok, Installed: "1.0.77", Note: "latest version unavailable: timeout"},
		{Agent: claude, Installed: "1.0." + strings.Repeat("9", 70), Latest: "2.0.0", Command: []string{"npm"}},
		{Agent: agy, Installed: "1.0.0"},
		{Agent: agentupdate.Catalog[1], Installed: "0.170.0+build", Latest: "0.171.0", Command: []string{"npm"}},
	})
	r := u.report(nil)
	if len(r) != 1 || len(r[0].List) != 0 || uncheckedIDs(r[0].Unchecked) != "grok@1.0.77,claude@,codex@" {
		t.Fatalf("fresh incomplete check: %#v", r)
	}
	b, _ := json.Marshal(ClaimRequest{AgentUpdates: &r[0].List, AgentUpdatesUnchecked: r[0].Unchecked})
	if !strings.Contains(string(b), `"agent_updates":[]`) || !strings.Contains(string(b), `"agent_updates_unchecked":[{"agent":"grok","installed":"1.0.77"},{"agent":"claude"},{"agent":"codex"}]`) {
		t.Fatalf("claim body: %s", b)
	}
}

func uncheckedIDs(us []UncheckedAgent) string {
	var out []string
	for _, u := range us {
		out = append(out, u.Agent+"@"+u.Installed)
	}
	return strings.Join(out, ",")
}

// After the CLI was updated past the known latest, a check that cannot reach the registry keeps
// nothing: the old update would offer an older version. The new installed version is reported.
func TestAnUpdatedCLIDropsTheKnownUpdate(t *testing.T) {
	grok := agentupdate.Catalog[4]
	var u agentUpdates
	u.set([]agentupdate.Status{{Agent: grok, Installed: "1.0.77", Latest: "1.0.92", Command: []string{"npm"}}})
	u.set([]agentupdate.Status{{Agent: grok, Installed: "1.0.95", Note: "latest version unavailable: timeout"}})
	if r := u.report(nil); len(r) != 1 || len(r[0].List) != 0 || uncheckedIDs(r[0].Unchecked) != "grok@1.0.95" {
		t.Fatalf("a newer install kept the old update: %#v", r)
	}
}

// An agent whose binary changed while the daemon ran (installed or updated since the check read
// its version) loses its cached update and its unchecked installed version; one unchanged keeps it.
func TestAChangedBinaryDropsTheCachedUpdate(t *testing.T) {
	grok, oc, claude := agentupdate.Catalog[4], agentupdate.Catalog[3], agentupdate.Catalog[0]
	var u agentUpdates
	u.set([]agentupdate.Status{
		{Agent: grok, Installed: "1.0.77", Latest: "1.0.92", Command: []string{"npm"}, Stamp: "grok-a"},
		{Agent: oc, Installed: "1.19.5", Latest: "1.19.6", Command: []string{"npm"}, Stamp: "oc-a"},
		{Agent: claude, Installed: "2.0.0", Note: "latest version unavailable: timeout", Stamp: "claude-a"},
	})
	now := map[string]string{"grok": "grok-b", "opencode": "oc-a", "claude": "claude-b"}
	stamp := func(b string) string { return now[b] }
	r := u.report(stamp)
	if len(r) != 1 || len(r[0].List) != 1 || r[0].List[0].Agent != "opencode" || uncheckedIDs(r[0].Unchecked) != "claude@" {
		t.Fatalf("after grok and claude changed: %#v", r)
	}
	// Changing back does not bring the stale update back.
	now["grok"] = "grok-a"
	if r := u.report(stamp); len(r[0].List) != 1 {
		t.Fatalf("a stale update came back: %#v", r)
	}
	// A binary that is gone counts as changed.
	delete(now, "opencode")
	if r := u.report(stamp); len(r[0].List) != 0 {
		t.Fatalf("a removed binary kept its update: %#v", r)
	}
}
