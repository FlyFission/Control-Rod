package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
)

// The claim says this daemon reads reasoning_effort, and a job that carries one reaches the run the
// adapters launch from. A level outside the contract is refused like any other bad field.
func TestClaimCarriesTheReasoningEffortToTheRun(t *testing.T) {
	job := func(effort string) string {
		return `{"run":{"schema_version":"0.1.0","id":"x","package_id":"p","package_revision":0,"role":"author","agent_baseline":"a","runtime":{"kind":"subscription","provider":"claude","model":"default"},"round":1,"status":"running","queued_at":"2026-10-23T00:00:00Z"},"inputs":[],"claim":{"token":"t","lease_expires_at":"2026-10-23T00:00:00Z","heartbeat_seconds":30}` + effort + `}`
	}
	var sent map[string]any
	body := job(`,"reasoning_effort":"high"`)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&sent)
		fmt.Fprint(w, body)
	}))
	defer srv.Close()
	got, err := NewClient(srv.URL, "token").Claim(context.Background(), []string{"claude"}, nil, 0, nil)
	if err != nil {
		t.Fatal(err)
	}
	if sent["supports_reasoning_effort"] != true {
		t.Fatalf("claim did not say it reads reasoning_effort: %v", sent)
	}
	if got.Run.ReasoningEffort != "high" {
		t.Fatalf("run effort = %q, want high", got.Run.ReasoningEffort)
	}

	body = job("")
	if got, err = NewClient(srv.URL, "token").Claim(context.Background(), []string{"claude"}, nil, 0, nil); err != nil || got.Run.ReasoningEffort != "" {
		t.Fatalf("no effort: run effort %q, err %v", got.Run.ReasoningEffort, err)
	}

	body = job(`,"reasoning_effort":"turbo"`)
	if got, err = NewClient(srv.URL, "token").Claim(context.Background(), []string{"claude"}, nil, 0, nil); err == nil {
		t.Fatalf("admitted an unknown effort: %+v", got)
	}
}

// Each CLI gets its own real flag, only for the levels it lists; anything else adds nothing.
func TestEffortMapsToEachCLIsOwnFlag(t *testing.T) {
	for _, tc := range []struct {
		effort string
		claude []string
		codex  []string
	}{
		{"", nil, nil},
		{"minimal", nil, []string{"-c", `model_reasoning_effort="minimal"`}},
		{"low", []string{"--effort", "low"}, []string{"-c", `model_reasoning_effort="low"`}},
		{"high", []string{"--effort", "high"}, []string{"-c", `model_reasoning_effort="high"`}},
		{"xhigh", []string{"--effort", "xhigh"}, []string{"-c", `model_reasoning_effort="xhigh"`}},
		{"max", []string{"--effort", "max"}, nil},
		{"off", nil, nil},
	} {
		run := Run{ReasoningEffort: tc.effort}
		if got := ClaudeEffortArgs(run); !slices.Equal(got, tc.claude) {
			t.Errorf("claude %q: %v, want %v", tc.effort, got, tc.claude)
		}
		if got := CodexEffortArgs(run); !slices.Equal(got, tc.codex) {
			t.Errorf("codex %q: %v, want %v", tc.effort, got, tc.codex)
		}
	}
}

// The launched argument lists carry the flag, and Codex's prompt stays last.
func TestLaunchedCommandsCarryTheEffort(t *testing.T) {
	ws := &Workspace{Dir: t.TempDir()}
	at := testPaths(ws)
	p := testPolicy()
	run := Run{Runtime: RuntimeRef{Provider: "claude", Model: "default"}, ReasoningEffort: "high"}

	cmd, err := claudeAdapter{}.Command(run, ws, p, at)
	if err != nil {
		t.Fatal(err)
	}
	if i := slices.Index(cmd.Args, "--effort"); i < 0 || cmd.Args[i+1] != "high" {
		t.Fatalf("claude args lack --effort high: %v", cmd.Args)
	}

	run.Runtime.Provider = "codex"
	cmd, err = codexAdapter{}.Command(run, ws, p, at)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(cmd.Args, `model_reasoning_effort="high"`) {
		t.Fatalf("codex args lack the effort override: %v", cmd.Args)
	}
	if cmd.Args[len(cmd.Args)-1] != Prompt {
		t.Fatalf("codex prompt is not last: %v", cmd.Args)
	}

	run.ReasoningEffort = ""
	cmd, err = claudeAdapter{}.Command(run, ws, p, at)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(cmd.Args, "--effort") {
		t.Fatalf("claude args gained --effort with none chosen: %v", cmd.Args)
	}
}
