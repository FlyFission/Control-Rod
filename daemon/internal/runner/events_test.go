package runner

import (
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
