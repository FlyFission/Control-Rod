package runner

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const (
	rlLine = `{"timestamp":"%TS%","type":"event_msg","payload":{"type":"token_count","info":{"last_token_usage":{"input_tokens":5},"note":"PROMPT-TEXT-SECRET"},"rate_limits":{"primary":{"used_percent":%P%,"window_minutes":300,"resets_at":1764000000},"secondary":{"used_percent":3.5,"window_minutes":10080,"resets_at":1764500000},"plan_type":"%PLAN%"}}}`
	noRL   = `{"timestamp":"2025-11-24T10:00:00Z","type":"event_msg","payload":{"type":"token_count","info":{"note":"PROMPT-TEXT-SECRET"},"rate_limits":null}}`
)

func rl(ts, p, plan string) string {
	return strings.NewReplacer("%TS%", ts, "%P%", p, "%PLAN%", plan).Replace(rlLine)
}

func writeRollout(t *testing.T, root, day, name string, lines ...string) string {
	t.Helper()
	dir := filepath.Join(root, day)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(strings.Join(lines, "\n")+"\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestReadCodexUsage(t *testing.T) {
	huge := strings.Repeat("x", 300<<10)
	tests := []struct {
		name     string
		setup    func(root string)
		ok       bool
		primary  float64
		plan     string
		observed string
	}{
		{"missing dir", func(string) {}, false, 0, "", ""},
		{"newest snapshot in newest file", func(r string) {
			writeRollout(t, r, "2025/11/23", "rollout-2025-11-23T01-00-00-a.jsonl", rl("2025-11-23T01:00:00Z", "90.0", "pro"))
			writeRollout(t, r, "2025/11/24", "rollout-2025-11-24T01-00-00-b.jsonl",
				rl("2025-11-24T01:00:00Z", "5.0", "plus"), noRL, rl("2025-11-24T02:00:00Z", "11.0", "plus"), noRL)
		}, true, 11, "plus", "2025-11-24T02:00:00Z"},
		{"huge non-json line ignored", func(r string) {
			writeRollout(t, r, "2025/11/24", "rollout-2025-11-24T01-00-00-b.jsonl",
				huge, rl("2025-11-24T01:00:00Z", "7.0", "Bad Plan!"))
		}, true, 7, "", "2025-11-24T01:00:00Z"},
		{"only lines without rate_limits", func(r string) {
			writeRollout(t, r, "2025/11/24", "rollout-2025-11-24T01-00-00-b.jsonl", noRL, "not json")
		}, false, 0, "", ""},
		{"over 100 clamps", func(r string) {
			writeRollout(t, r, "2025/11/24", "rollout-2025-11-24T01-00-00-b.jsonl", rl("2025-11-24T01:00:00Z", "250", "plus"))
		}, true, 100, "plus", "2025-11-24T01:00:00Z"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			root := filepath.Join(t.TempDir(), "sessions")
			if tc.name != "missing dir" {
				tc.setup(root)
			}
			p, ok := ReadCodexUsage(root)
			if ok != tc.ok {
				t.Fatalf("ok=%v want %v", ok, tc.ok)
			}
			if !ok {
				return
			}
			if p.Source != "cli-log" || p.ID != "codex" || p.Plan != tc.plan || p.ObservedAt != tc.observed {
				t.Fatalf("provider %+v", p)
			}
			if len(p.Windows) != 2 || p.Windows[0].ID != "five_hour" || p.Windows[0].UsedPercent != tc.primary ||
				p.Windows[0].WindowMinutes != 300 || p.Windows[1].ID != "seven_day" || p.Windows[1].UsedPercent != 3.5 ||
				p.Windows[0].ResetsAt != "2025-11-24T16:00:00Z" {
				t.Fatalf("windows %+v", p.Windows)
			}
			b, _ := json.Marshal(p)
			if strings.Contains(string(b), "PROMPT-TEXT-SECRET") {
				t.Fatalf("prompt text leaked: %s", b)
			}
		})
	}
}

func TestCodexWindowIDs(t *testing.T) {
	line := `{"timestamp":"2025-11-24T10:00:00Z","payload":{"type":"token_count","rate_limits":{"primary":{"used_percent":1,"window_minutes":60},"secondary":{"used_percent":2}}}}`
	p, ok := parseCodexLine([]byte(line))
	if !ok || p.Windows[0].ID != "primary" || p.Windows[1].ID != "secondary" || p.Windows[1].WindowMinutes != 0 {
		t.Fatalf("%+v %v", p, ok)
	}
	other := strings.Replace(line, `"rate_limits":{`, `"rate_limits":{"limit_id":"codex_other",`, 1)
	if _, ok := parseCodexLine([]byte(other)); ok {
		t.Fatal("per-model limit must not be the subscription window")
	}
}

func TestCodexSymlinkNotFollowed(t *testing.T) {
	outside := t.TempDir()
	writeRollout(t, outside, "x", "rollout-1.jsonl", rl("2025-11-24T01:00:00Z", "5.0", "plus"))
	root := filepath.Join(t.TempDir(), "sessions")
	if err := os.MkdirAll(filepath.Join(root, "2025/11"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(outside, "x"), filepath.Join(root, "2025/11/24")); err != nil {
		t.Skip("no symlinks")
	}
	if _, ok := ReadCodexUsage(root); ok {
		t.Fatal("followed a symlinked day directory")
	}
}

func TestParseClaudeRateLimit(t *testing.T) {
	ev := func(typ, util, status string) string {
		return `{"type":"rate_limit_event","rate_limit_info":{"status":"` + status + `","resetsAt":1764000000,"rateLimitType":"` + typ + `","utilization":` + util + `},"uuid":"u"}`
	}
	tests := []struct {
		name   string
		line   string
		ok     bool
		id     string
		pct    float64
		status string
	}{
		{"fraction", ev("five_hour", "0.42", "allowed"), true, "five_hour", 42, "allowed"},
		{"percent", ev("seven_day", "63", "allowed_warning"), true, "seven_day", 63, "warning"},
		{"clamped", ev("seven_day_opus", "400", "rejected"), true, "seven_day_opus", 100, "rejected"},
		{"negative", ev("seven_day_sonnet", "-3", "allowed"), true, "seven_day_sonnet", 0, "allowed"},
		{"overage ignored", ev("overage", "0.5", "allowed"), false, "", 0, ""},
		{"no utilization", `{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","rateLimitType":"five_hour"}}`, false, "", 0, ""},
		{"garbage", `{"type":"rate_limit_event", nope`, false, "", 0, ""},
		{"other type", `{"type":"assistant","text":"rate_limit_event"}`, false, "", 0, ""},
		{"plain text", `rate_limit_event`, false, "", 0, ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			w, ok := parseClaudeRateLimit(tc.line)
			if ok != tc.ok {
				t.Fatalf("ok=%v want %v", ok, tc.ok)
			}
			if ok && (w.ID != tc.id || w.UsedPercent != tc.pct || w.Status != tc.status || w.ResetsAt != "2025-11-24T16:00:00Z" || w.WindowMinutes == 0) {
				t.Fatalf("window %+v", w)
			}
		})
	}
}

func TestUsageReport(t *testing.T) {
	home := t.TempDir()
	ctl := t.TempDir()
	root := filepath.Join(home, ".codex", "sessions")
	writeRollout(t, root, "2025/11/24", "rollout-2025-11-24T01-00-00-b.jsonl",
		rl("2025-11-24T01:00:00Z", "11.0", "plus")+`,"leak":"sk-ant-TOKENLOOKING1234567890"`, // malformed: dropped
		rl("2025-11-24T01:30:00Z", "12.0", "plus"))
	u := newUsageSources(ctl)
	now := time.Date(2025, 11, 24, 12, 0, 0, 0, time.UTC)
	u.store.record(RuntimeClaude, UsageWindow{ID: "five_hour", WindowMinutes: 300, UsedPercent: 30, ResetsAt: "2025-11-24T15:00:00Z"}, now)
	u.store.record(RuntimeClaude, UsageWindow{ID: "seven_day", WindowMinutes: 10080, UsedPercent: 70, ResetsAt: "2025-11-24T11:00:00Z"}, now) // already reset
	rep := u.Report(now, home, func(string) string { return "" })

	by := map[string]UsageProvider{}
	for _, p := range rep.Providers {
		if !usageProviderIDs[p.ID] {
			t.Fatalf("id %q is outside the contract", p.ID)
		}
		by[p.ID] = p
	}
	if c := by["codex"]; c.Source != "cli-log" || c.Windows[0].UsedPercent != 12 {
		t.Fatalf("codex %+v", c)
	}
	if c := by["claude"]; c.Source != "cli-stream" || len(c.Windows) != 1 || c.Windows[0].ID != "five_hour" {
		t.Fatalf("claude %+v", c)
	}
	if rep.ReadAt != "2025-11-24T12:00:00Z" {
		t.Fatal(rep.ReadAt)
	}
	for id, p := range by {
		if p.Source == "none" && len(p.Windows) != 0 {
			t.Fatalf("%s none with windows", id)
		}
	}
	b, _ := json.Marshal(rep)
	for _, bad := range []string{"TOKENLOOKING", "sk-ant", "PROMPT-TEXT-SECRET", "token"} {
		if strings.Contains(string(b), bad) {
			t.Fatalf("%q in report: %s", bad, b)
		}
	}

	// The stream store survives a restart through its file.
	u2 := newUsageSources(ctl)
	if p, ok := u2.store.provider(RuntimeClaude, now); !ok || p.Windows[0].UsedPercent != 30 {
		t.Fatalf("reload %+v %v", p, ok)
	}
	// Codex's log is read at most once per cache interval.
	writeRollout(t, root, "2025/11/24", "rollout-2025-11-24T09-00-00-c.jsonl", rl("2025-11-24T09:00:00Z", "40.0", "plus"))
	rep2 := u.Report(now.Add(10*time.Second), home, func(string) string { return "" })
	for _, p := range rep2.Providers {
		if p.ID == "codex" && p.Windows[0].UsedPercent != 12 {
			t.Fatal("cache not used")
		}
	}
	rep3 := u.Report(now.Add(2*time.Minute), home, func(string) string { return "" })
	for _, p := range rep3.Providers {
		if p.ID == "codex" && p.Windows[0].UsedPercent != 40 {
			t.Fatalf("cache not refreshed: %+v", p)
		}
	}
}

func TestLogBufferCapturesUsage(t *testing.T) {
	var got []UsageWindow
	a, _ := AdapterFor(RuntimeClaude)
	b := &logBuffer{adapt: a, admit: NewAdmission(20, 200), onUsage: func(w UsageWindow) { got = append(got, w) }}
	b.add(`{"type":"rate_limit_event","rate_limit_info":{"status":"allowed","resetsAt":1764000000,"rateLimitType":"five_hour","utilization":0.5}}`)
	if len(got) != 1 || got[0].UsedPercent != 50 {
		t.Fatalf("%+v", got)
	}
}
