package runner

import (
	"strings"
	"testing"
)

// A failed turn carries what the agent CLI said, in plain words with what to do (review DMN-13).
func TestTurnErrorOfPlacesTheCLIsReason(t *testing.T) {
	cases := []struct {
		line, reason, said string
	}{
		{`{"type":"result","subtype":"success","is_error":true,"result":"Claude AI usage limit reached|1764000000"}`, turnReasonRateLimit, "Claude AI usage limit reached|1764000000"},
		{`{"type":"result","subtype":"success","is_error":true,"result":"Invalid API key · Please run /login"}`, turnReasonSignIn, "Invalid API key · Please run /login"},
		{`{"type":"result","subtype":"success","is_error":true,"result":"OAuth token has expired. Please obtain a new token."}`, turnReasonSignIn, ""},
		{`{"type":"result","subtype":"success","is_error":true,"result":"Prompt is too long"}`, turnReasonContext, "Prompt is too long"},
		{`{"type":"result","subtype":"success","is_error":true,"result":"Claude Code is unable to respond to this request, which appears to violate our Usage Policy"}`, turnReasonRefused, ""},
		{`{"type":"result","subtype":"error_max_turns","is_error":true}`, turnReasonMaxTurns, "error_max_turns"},
		{`{"type":"result","subtype":"success","is_error":true,"result":"API Error","api_error_status":529}`, turnReasonService, "API Error"},
		{`{"type":"turn.failed","error":{"message":"You've hit your usage limit. Try again later."}}`, turnReasonRateLimit, ""},
		{`{"type":"turn.failed","error":{"message":"Your input exceeds the context window of this model."}}`, turnReasonContext, ""},
		{`{"type":"error","message":"stream error: unexpected status 401 Unauthorized"}`, turnReasonSignIn, ""},
		{`{"type":"turn.failed","error":{"message":"something odd"}}`, "", "something odd"},
	}
	for _, c := range cases {
		te, ok := TurnErrorOf(c.line)
		if !ok {
			t.Errorf("%s: no turn error", c.line)
			continue
		}
		if te.Reason != c.reason {
			t.Errorf("%s: reason %q, want %q", c.line, te.Reason, c.reason)
		}
		if c.said != "" && te.Said != c.said {
			t.Errorf("%s: said %q, want %q", c.line, te.Said, c.said)
		}
	}
	for _, line := range []string{
		`{"type":"result","subtype":"success","result":"usage limit reached in the docs"}`,
		`{"type":"assistant","message":{"content":[{"type":"text","text":"error: rate limit"}]}}`,
		`plain text: rate limit`,
		`{"type":"turn.completed"}`,
	} {
		if te, ok := TurnErrorOf(line); ok {
			t.Errorf("%s: read as a turn error %+v", line, te)
		}
	}
}

func TestTurnErrorWordsSayWhatToDoAndStayOnOneLine(t *testing.T) {
	te, _ := TurnErrorOf(`{"type":"result","subtype":"success","is_error":true,"result":"Claude AI usage limit reached\nreset at 5pm"}`)
	w := te.Words()
	if !strings.HasPrefix(w, "The agent's usage limit is reached. Wait for it to reset") || !strings.Contains(w, `The agent said: "Claude AI usage limit reached reset at 5pm"`) {
		t.Fatalf("words %q", w)
	}
	long, _ := TurnErrorOf(`{"type":"turn.failed","error":{"message":"` + strings.Repeat("é", 400) + `"}}`)
	if len(long.Said) > maxSaid+len("…") || !strings.HasSuffix(long.Said, "…") {
		t.Fatalf("said not clipped: %d bytes", len(long.Said))
	}
	if strings.ContainsRune(long.Words(), '—') {
		t.Fatal("no em dashes in words a person reads")
	}
}

// After an error exit with no report, only a stderr line naming a known reason is used.
func TestStderrNamesAReasonOnlyWhenItMatchesOne(t *testing.T) {
	if te, ok := stderrTurnError("[stderr] Error: Invalid API key. Please run /login"); !ok || te.Reason != turnReasonSignIn {
		t.Fatalf("sign-in line: %+v %v", te, ok)
	}
	for _, line := range []string{"[stderr] warning: something", "[stderr] request timed out, retrying", "Invalid API key on stdout"} {
		if te, ok := stderrTurnError(line); ok {
			t.Fatalf("%q read as %+v", line, te)
		}
	}
}

// The best source wins: the failed end-of-turn report, then an error event, then stderr (exits only).
func TestLogBufferKeepsTheBestTurnError(t *testing.T) {
	b := &logBuffer{}
	b.add("[stderr] Error: Invalid API key")
	if _, ok := b.turnError(false); ok {
		t.Fatal("stderr explained a run that did not exit with an error")
	}
	if te, ok := b.turnError(true); !ok || te.Reason != turnReasonSignIn {
		t.Fatalf("exit: %+v %v", te, ok)
	}
	b.add(`{"type":"error","message":"Reconnecting... 1/5"}`)
	b.add(`{"type":"turn.failed","error":{"message":"You've hit your usage limit."}}`)
	if te, ok := b.turnError(true); !ok || te.Reason != turnReasonRateLimit {
		t.Fatalf("turn.failed: %+v %v", te, ok)
	}
	if err := turnFailure(nil, b); err == nil {
		t.Fatal("a failed turn was not a failure")
	} else if te, ok := turnErrorFor(err, b); !ok || te.Reason != turnReasonRateLimit {
		t.Fatalf("turnErrorFor: %+v %v", te, ok)
	}
	if _, ok := turnErrorFor(ErrTimeout, b); ok {
		t.Fatal("a timeout is the daemon's own failure, not the agent's to explain")
	}
}
