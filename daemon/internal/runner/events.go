package runner

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// Event is one normalized thing an agent did (specification 20): a message, a tool call starting
// or ending, a file change, a permission request, token usage, an error, or the exit. The daemon
// builds these from each runtime's own output so the browser only renders; the raw lines stay in
// the run log. Text is clipped and tool inputs are kept only as a digest and a short summary.
type Event struct {
	Kind string `json:"kind"`
	At   string `json:"at"`
	// Tool is the tool name for tool_start, tool_end and permission_request.
	Tool string `json:"tool,omitempty"`
	// Summary is a short plain label built from the tool's arguments (see toolLabel).
	Summary string `json:"summary,omitempty"`
	// InputDigest is the SHA-256 of the tool input as the runtime sent it.
	InputDigest string `json:"input_digest,omitempty"`
	// CallID links a tool_end to its tool_start.
	CallID string `json:"call_id,omitempty"`
	OK     *bool  `json:"ok,omitempty"`
	// Path is the changed file for file_change, relative to the workspace when it can be.
	Path string `json:"path,omitempty"`
	// Text is message or error text, clipped to MaxEventText bytes.
	Text         string `json:"text,omitempty"`
	InputTokens  int    `json:"input_tokens,omitempty"`
	OutputTokens int    `json:"output_tokens,omitempty"`
	CachedTokens int    `json:"cached_tokens,omitempty"`
	// Dropped counts events admission refused since the last one sent (kind "dropped").
	Dropped int `json:"dropped,omitempty"`

	// idx is the event's place in the run's sequence, given when it is kept; it travels as a
	// batch's events_from, never in the event itself.
	idx int
}

// Event kinds.
const (
	EvMessage    = "message"
	EvToolStart  = "tool_start"
	EvToolEnd    = "tool_end"
	EvFileChange = "file_change"
	EvPermission = "permission_request"
	EvUsage      = "usage"
	EvError      = "error"
	EvExit       = "exit"
	EvDropped    = "dropped"
	EvNotice     = "notice"
)

// MaxEventText bounds the text an event carries.
const MaxEventText = 2000

func clipText(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= MaxEventText {
		return s
	}
	cut := MaxEventText
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + "…"
}

func digestOf(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

func yes(b bool) *bool { return &b }

// Normalize turns one line of Claude Code stream-json or Codex --json output into events. Lines
// that are not JSON events (stderr, plain text) give none; they remain in the raw log.
func Normalize(line string, now time.Time) []Event {
	if !strings.HasPrefix(strings.TrimSpace(line), "{") {
		return nil
	}
	var ev map[string]any
	if json.Unmarshal([]byte(line), &ev) != nil {
		return nil
	}
	at := now.UTC().Format(time.RFC3339Nano)
	str := func(m map[string]any, k string) string { v, _ := m[k].(string); return v }
	num := func(m map[string]any, k string) int { v, _ := m[k].(float64); return int(v) }
	var out []Event
	switch typ := str(ev, "type"); typ {
	// Claude Code stream-json.
	case "assistant":
		msg, _ := ev["message"].(map[string]any)
		content, _ := msg["content"].([]any)
		for _, c := range content {
			block, _ := c.(map[string]any)
			switch str(block, "type") {
			case "text":
				if t := clipText(str(block, "text")); t != "" {
					out = append(out, Event{Kind: EvMessage, At: at, Text: t})
				}
			case "tool_use":
				name := str(block, "name")
				input, _ := block["input"].(map[string]any)
				out = append(out, Event{Kind: EvToolStart, At: at, Tool: token(name, 60), Summary: toolLabel(name, input),
					InputDigest: digestOf(block["input"]), CallID: token(str(block, "id"), 80)})
			}
		}
		if usage, ok := msg["usage"].(map[string]any); ok {
			out = append(out, Event{Kind: EvUsage, At: at, InputTokens: num(usage, "input_tokens"), OutputTokens: num(usage, "output_tokens"),
				CachedTokens: num(usage, "cache_read_input_tokens")})
		}
	case "user":
		msg, _ := ev["message"].(map[string]any)
		content, _ := msg["content"].([]any)
		for _, c := range content {
			block, _ := c.(map[string]any)
			if str(block, "type") != "tool_result" {
				continue
			}
			failed, _ := block["is_error"].(bool)
			e := Event{Kind: EvToolEnd, At: at, CallID: token(str(block, "tool_use_id"), 80), OK: yes(!failed)}
			if failed {
				e.Text = clipText(resultText(block["content"]))
			}
			out = append(out, e)
		}
	case "result":
		failed, _ := ev["is_error"].(bool)
		if failed {
			out = append(out, Event{Kind: EvError, At: at, Text: clipText(str(ev, "result"))})
		}
		if usage, ok := ev["usage"].(map[string]any); ok {
			out = append(out, Event{Kind: EvUsage, At: at, InputTokens: num(usage, "input_tokens"), OutputTokens: num(usage, "output_tokens"),
				CachedTokens: num(usage, "cache_read_input_tokens")})
		}
	// Codex --json.
	case "item.started", "item.completed":
		item, _ := ev["item"].(map[string]any)
		done := typ == "item.completed"
		id := token(str(item, "id"), 80)
		switch str(item, "type") {
		case "agent_message":
			if done {
				if t := clipText(str(item, "text")); t != "" {
					out = append(out, Event{Kind: EvMessage, At: at, Text: t})
				}
			}
		case "command_execution":
			cmd := str(item, "command")
			if !done {
				out = append(out, Event{Kind: EvToolStart, At: at, Tool: "command", Summary: clip("Run: " + firstWord(cmd)), InputDigest: digestOf(cmd), CallID: id})
			} else {
				code, hasCode := item["exit_code"].(float64)
				ok := str(item, "status") == "completed" && (!hasCode || code == 0)
				out = append(out, Event{Kind: EvToolEnd, At: at, Tool: "command", CallID: id, OK: yes(ok)})
			}
		case "file_change":
			if done {
				changes, _ := item["changes"].([]any)
				for _, c := range changes {
					ch, _ := c.(map[string]any)
					out = append(out, Event{Kind: EvFileChange, At: at, Path: clipText(str(ch, "path"))})
				}
			}
		case "web_search":
			if !done {
				out = append(out, Event{Kind: EvToolStart, At: at, Tool: "web_search", Summary: "Search", InputDigest: digestOf(item["query"]), CallID: id})
			} else {
				out = append(out, Event{Kind: EvToolEnd, At: at, Tool: "web_search", CallID: id, OK: yes(true)})
			}
		case "error":
			if done {
				out = append(out, Event{Kind: EvError, At: at, Text: clipText(str(item, "message"))})
			}
		}
	case "turn.completed":
		if usage, ok := ev["usage"].(map[string]any); ok {
			out = append(out, Event{Kind: EvUsage, At: at, InputTokens: num(usage, "input_tokens"), OutputTokens: num(usage, "output_tokens"),
				CachedTokens: num(usage, "cached_input_tokens")})
		}
	case "turn.failed":
		e, _ := ev["error"].(map[string]any)
		out = append(out, Event{Kind: EvError, At: at, Text: clipText(str(e, "message"))})
	case "error":
		out = append(out, Event{Kind: EvError, At: at, Text: clipText(str(ev, "message"))})
	}
	return out
}

// resultText reads a tool_result's content, which is a string or a list of text blocks.
func resultText(v any) string {
	switch c := v.(type) {
	case string:
		return c
	case []any:
		var parts []string
		for _, b := range c {
			if m, ok := b.(map[string]any); ok {
				if t, ok := m["text"].(string); ok {
					parts = append(parts, t)
				}
			}
		}
		return strings.Join(parts, "\n")
	}
	return ""
}

// Admission bounds telemetry per run (specification 20): at most Burst events at once, refilled
// at Rate per second. Refused events are counted and reported as one "dropped" event, so a gap is
// visible rather than silent.
type Admission struct {
	mu      sync.Mutex
	Rate    float64
	Burst   float64
	tokens  float64
	last    time.Time
	dropped int
}

// NewAdmission returns an admission bucket, full.
func NewAdmission(rate, burst float64) *Admission {
	return &Admission{Rate: rate, Burst: burst, tokens: burst}
}

// Admit filters events through the bucket, prefixing a "dropped" event when some were refused
// since the last admitted one.
func (a *Admission) Admit(events []Event, now time.Time) []Event {
	a.mu.Lock()
	defer a.mu.Unlock()
	if !a.last.IsZero() {
		a.tokens = min(a.Burst, a.tokens+now.Sub(a.last).Seconds()*a.Rate)
	}
	a.last = now
	var out []Event
	for _, e := range events {
		// The exit event always gets through, after the count of anything refused before it, so a
		// run's story never ends without its ending.
		if e.Kind == EvExit {
			if a.dropped > 0 {
				out = append(out, Event{Kind: EvDropped, At: e.At, Dropped: a.dropped})
				a.dropped = 0
			}
			out = append(out, e)
			continue
		}
		if a.tokens < 1 {
			a.dropped++
			continue
		}
		if a.dropped > 0 && a.tokens >= 2 {
			out = append(out, Event{Kind: EvDropped, At: e.At, Dropped: a.dropped})
			a.tokens--
			a.dropped = 0
		}
		out = append(out, e)
		a.tokens--
	}
	return out
}
