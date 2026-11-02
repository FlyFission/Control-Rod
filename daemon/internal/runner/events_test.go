//go:build unix

package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

var t0 = time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)

func TestNormalizesClaudeStreamJSON(t *testing.T) {
	lines := []string{
		`{"type":"system","subtype":"init","model":"claude-x"}`,
		`{"type":"assistant","message":{"content":[{"type":"text","text":"Reading the brief"},{"type":"tool_use","id":"tu_1","name":"Read","input":{"file_path":"/w/inputs/BRIEF.md"}}],"usage":{"input_tokens":10,"output_tokens":5,"cache_read_input_tokens":3}}}`,
		`{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tu_1","content":"ok"}]}}`,
		`{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tu_2","is_error":true,"content":[{"type":"text","text":"Output redirection needs approval"}]}]}}`,
		`{"type":"result","subtype":"error","is_error":true,"result":"boom","usage":{"input_tokens":20,"output_tokens":7}}`,
		`[stderr] warning: something`,
	}
	var got []Event
	for _, l := range lines {
		got = append(got, Normalize(l, t0)...)
	}
	kinds := []string{}
	for _, e := range got {
		kinds = append(kinds, e.Kind)
	}
	want := "message,tool_start,usage,tool_end,tool_end,error,usage"
	if strings.Join(kinds, ",") != want {
		t.Fatalf("kinds %v, want %s", kinds, want)
	}
	start := got[1]
	if start.Tool != "Read" || start.Summary != "Read: BRIEF.md" || len(start.InputDigest) != 64 || start.CallID != "tu_1" {
		t.Fatalf("tool_start %+v", start)
	}
	if !*got[3].OK || *got[4].OK || got[4].Text != "Output redirection needs approval" {
		t.Fatalf("tool_end %+v %+v", got[3], got[4])
	}
	if got[2].InputTokens != 10 || got[2].CachedTokens != 3 {
		t.Fatalf("usage %+v", got[2])
	}
}

func TestNormalizesCodexJSON(t *testing.T) {
	lines := []string{
		`{"type":"thread.started","thread_id":"t"}`,
		`{"type":"item.started","item":{"id":"i1","type":"command_execution","command":"python3 calc.py --x 1","status":"in_progress"}}`,
		`{"type":"item.completed","item":{"id":"i1","type":"command_execution","command":"python3 calc.py --x 1","exit_code":2,"status":"failed"}}`,
		`{"type":"item.completed","item":{"id":"i2","type":"file_change","changes":[{"path":"out/report.md","kind":"add"}]}}`,
		`{"type":"item.completed","item":{"id":"i3","type":"agent_message","text":"Done."}}`,
		`{"type":"turn.completed","usage":{"input_tokens":100,"cached_input_tokens":40,"output_tokens":9}}`,
		`{"type":"turn.failed","error":{"message":"rate limited"}}`,
	}
	var got []Event
	for _, l := range lines {
		got = append(got, Normalize(l, t0)...)
	}
	kinds := []string{}
	for _, e := range got {
		kinds = append(kinds, e.Kind)
	}
	if strings.Join(kinds, ",") != "tool_start,tool_end,file_change,message,usage,error" {
		t.Fatalf("kinds %v", kinds)
	}
	if got[0].Summary != "Run: python3" || *got[1].OK || got[2].Path != "out/report.md" || got[4].CachedTokens != 40 || got[5].Text != "rate limited" {
		t.Fatalf("events %+v", got)
	}
}

func TestEventTextIsClipped(t *testing.T) {
	long := strings.Repeat("é", MaxEventText)
	got := Normalize(`{"type":"assistant","message":{"content":[{"type":"text","text":"`+long+`"}]}}`, t0)
	if len(got) != 1 || len(got[0].Text) > MaxEventText+len("…") || !strings.HasSuffix(got[0].Text, "…") {
		t.Fatalf("not clipped: %d bytes", len(got[0].Text))
	}
}

func TestAdmissionCountsWhatItRefuses(t *testing.T) {
	a := NewAdmission(1, 3)
	burst := make([]Event, 10)
	for i := range burst {
		burst[i] = Event{Kind: EvToolStart, At: "x"}
	}
	first := a.Admit(burst, t0)
	if len(first) != 3 {
		t.Fatalf("admitted %d, want the burst of 3", len(first))
	}
	// Five seconds later five tokens are back: one goes to the dropped notice, four to events.
	later := a.Admit([]Event{{Kind: EvMessage, At: "y"}}, t0.Add(5*time.Second))
	if len(later) != 2 || later[0].Kind != EvDropped || later[0].Dropped != 7 || later[1].Kind != EvMessage {
		t.Fatalf("got %+v", later)
	}
}

func TestPermissionHookSettingsAndPayloads(t *testing.T) {
	var settings struct {
		Hooks map[string][]struct {
			Matcher string `json:"matcher"`
			Hooks   []struct{ Type, Command string }
		} `json:"hooks"`
	}
	if err := json.Unmarshal([]byte(PermissionHookSettings("/home/x/it's/hooks.jsonl")), &settings); err != nil {
		t.Fatal(err)
	}
	hook := settings.Hooks["PermissionRequest"][0]
	if hook.Matcher != "*" || hook.Hooks[0].Type != "command" || hook.Hooks[0].Command != `{ cat; echo; } >> '/home/x/it'\''s/hooks.jsonl'` {
		t.Fatalf("settings %+v", settings)
	}
	ws := &Workspace{Dir: "/w", Inputs: "/w/inputs", Out: "/w/out", HookFile: "/h/r.jsonl"}
	args := strings.Join(ClaudeArgs(ws, ""), " ")
	if !strings.Contains(args, "--settings") {
		t.Fatal("a hook file must be passed to Claude Code as settings")
	}
	payload := `{"hook_event_name":"PermissionRequest","tool_name":"Bash","tool_input":{"command":"rm -rf /tmp/x"}}` + "\n" + `not json` + "\n"
	got := PermissionEvents([]byte(payload), t0)
	if len(got) != 1 || got[0].Kind != EvPermission || got[0].Tool != "Bash" || got[0].Summary != "Run: rm" || len(got[0].InputDigest) != 64 {
		t.Fatalf("got %+v", got)
	}
}

func TestDaemonSendsNormalizedEventsAndTheExit(t *testing.T) {
	home := t.TempDir()
	script := `echo '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t1","name":"Write","input":{"file_path":"out/r.md"}}]}}'; echo done > out/r.md`
	job := &Job{Run: testRun("run-events", "author"), Inputs: []NamedFile{{Name: "BRIEF.md", ContentBase64: b64("x")}, {Name: "FAKE.sh", ContentBase64: b64(script)}}}
	api, srv := newFakeAPI(t, job)
	var logs bytes.Buffer
	cancel, stopped := startDaemon(t, srv, home, time.Minute, &logs)
	api.wait(t, 1)
	cancel()
	<-stopped
	api.mu.Lock()
	defer api.mu.Unlock()
	var kinds []string
	for _, b := range api.logs["run-events"] {
		for _, e := range b.Events {
			kinds = append(kinds, e.Kind)
		}
	}
	if got := strings.Join(kinds, ","); got != "tool_start,exit" {
		t.Fatalf("events %q", got)
	}
}

func TestBreakerStopsARunawayRun(t *testing.T) {
	home := t.TempDir()
	line := `{"type":"assistant","message":{"content":[{"type":"tool_use","id":"t","name":"Bash","input":{"command":"ls"}}]}}`
	script := `for i in $(seq 1 50); do echo '` + line + `'; sleep 0.02; done; sleep 30`
	job := &Job{Run: testRun("run-runaway", "author"), Inputs: []NamedFile{{Name: "BRIEF.md", ContentBase64: b64("x")}, {Name: "FAKE.sh", ContentBase64: b64(script)}}}
	api, srv := newFakeAPI(t, job)
	d := New(Config{API: srv.URL, Token: testToken, Home: home, Parallel: 1, Timeout: time.Minute, PollInterval: 20 * time.Millisecond,
		LogInterval: 20 * time.Millisecond, Runtimes: []string{RuntimeFake}, StopAfterHangup: 100 * time.Millisecond, StopGrace: 500 * time.Millisecond,
		Breaker: &BreakerPolicy{RepeatWarn: 3, RepeatTrip: 6}, Logger: slog.New(slog.NewTextHandler(io.Discard, nil))})
	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() { _ = d.Run(ctx); close(stopped) }()
	api.wait(t, 1)
	cancel()
	<-stopped
	api.mu.Lock()
	defer api.mu.Unlock()
	c := api.done["run-runaway"]
	if c.Status != "failed" || !strings.Contains(c.Error, "breaker: the same Bash call with the same input 6 times in a row") {
		t.Fatalf("completion %q %q", c.Status, c.Error)
	}
	var notices []string
	for _, b := range api.logs["run-runaway"] {
		for _, e := range b.Events {
			if e.Kind == EvNotice {
				notices = append(notices, e.Text)
			}
		}
	}
	if len(notices) != 2 || !strings.HasPrefix(notices[0], "Breaker warning") || !strings.HasPrefix(notices[1], "Breaker tripped") {
		t.Fatalf("notices %v", notices)
	}
}

func TestHookTailSkipsAnOversizedRecordAndResumesWhereTheLoopStopped(t *testing.T) {
	path := filepath.Join(t.TempDir(), "hooks.jsonl")
	appendTo := func(s string) {
		f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
		if err != nil {
			t.Fatal(err)
		}
		defer f.Close()
		if _, err := f.WriteString(s); err != nil {
			t.Fatal(err)
		}
	}
	req := func(tool string) string { return `{"tool_name":"` + tool + `","tool_input":{"command":"ls"}}` + "\n" }
	h := &hookTail{path: path}
	appendTo(req("Bash") + `{"tool_name":"Wri`)
	if got := h.next(t0); len(got) != 1 || got[0].Tool != "Bash" {
		t.Fatalf("whole lines only: %+v", got)
	}
	// The rest of the partial record arrives, then one larger than a read, then a normal one.
	appendTo(`te","tool_input":{}}` + "\n")
	appendTo(`{"tool_name":"Bash","tool_input":{"command":"` + strings.Repeat("x", maxHookRead+10) + `"}}` + "\n")
	appendTo(req("Read"))
	// The same tail continues (as the final drain does after the flush loop), so nothing repeats.
	got := h.next(t0)
	var kinds []string
	for _, e := range got {
		kinds = append(kinds, e.Kind+":"+e.Tool)
	}
	if strings.Join(kinds, ",") != "permission_request:Write,notice:,permission_request:Read" {
		t.Fatalf("got %v", kinds)
	}
	if again := h.next(t0); len(again) != 0 {
		t.Fatalf("nothing is reported twice: %+v", again)
	}
}

func TestTheExitEventIsNeverRefusedByAdmission(t *testing.T) {
	a := NewAdmission(1, 1)
	out := a.Admit([]Event{{Kind: EvMessage}, {Kind: EvMessage}, {Kind: EvMessage}, {Kind: EvExit, At: "t"}}, t0)
	if n := len(out); n != 3 || out[1].Kind != EvDropped || out[1].Dropped != 2 || out[2].Kind != EvExit {
		t.Fatalf("got %+v", out)
	}
}
