package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
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
	u.refreshLogs(home, func(string) string { return "" })
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
	u.store.wait()
	u2.store.hydrate()
	if p, ok := u2.store.provider(RuntimeClaude, now); !ok || p.Windows[0].UsedPercent != 30 {
		t.Fatalf("reload %+v %v", p, ok)
	}
	// A claim never reads the log: a new rollout shows only after the background refresh runs.
	writeRollout(t, root, "2025/11/24", "rollout-2025-11-24T09-00-00-c.jsonl", rl("2025-11-24T09:00:00Z", "40.0", "plus"))
	rep2 := u.Report(now.Add(10*time.Second), home, func(string) string { return "" })
	for _, p := range rep2.Providers {
		if p.ID == "codex" && p.Windows[0].UsedPercent != 12 {
			t.Fatal("Report read the log in the claim path")
		}
	}
	u.refreshLogs(home, func(string) string { return "" })
	rep3 := u.Report(now.Add(2*time.Minute), home, func(string) string { return "" })
	for _, p := range rep3.Providers {
		if p.ID == "codex" && p.Windows[0].UsedPercent != 40 {
			t.Fatalf("snapshot not refreshed: %+v", p)
		}
	}
}

// M5: startLogs reads once at start, then on its interval, in the background.
func TestUsageStartLogsBackground(t *testing.T) {
	home := t.TempDir()
	root := filepath.Join(home, ".codex", "sessions")
	writeRollout(t, root, "2025/11/24", "rollout-2025-11-24T01-00-00-b.jsonl", rl("2025-11-24T01:00:00Z", "11.0", "plus"))
	u := newUsageSources("")
	u.logEvery = 50 * time.Millisecond
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	u.startLogs(ctx, home, func(string) string { return "" })
	codexPct := func() float64 {
		for _, p := range u.Report(time.Now(), home, nil).Providers {
			if p.ID == "codex" && len(p.Windows) > 0 {
				return p.Windows[0].UsedPercent
			}
		}
		return -1
	}
	waitFor := func(want float64) {
		t.Helper()
		for end := time.Now().Add(5 * time.Second); time.Now().Before(end); time.Sleep(20 * time.Millisecond) {
			if codexPct() == want {
				return
			}
		}
		t.Fatalf("codex never reached %v (now %v)", want, codexPct())
	}
	waitFor(11)
	writeRollout(t, root, "2025/11/25", "rollout-2025-11-25T01-00-00-b.jsonl", rl("2025-11-25T01:00:00Z", "60.0", "plus"))
	waitFor(60)
}

// B2: plan is one of the contract's values, exact lowercase after trimming, else omitted.
func TestUsagePlanClosedSet(t *testing.T) {
	for in, want := range map[string]string{
		"free": "free", "go": "go", "plus": "plus", "pro": "pro", "max": "max", "team": "team",
		"business": "business", "enterprise": "enterprise", "edu": "edu", " plus\n": "plus",
		"Plus": "", "PRO": "", "prolite": "", "promax": "", "edu_plus": "", "self_serve_business_prolite": "",
		"ent26": "", "enterprise_cbp_usage_based": "", "sci": "", "unknown": "", "abc": "", "": "", "pro max": "",
	} {
		if got := usagePlan(in); got != want {
			t.Fatalf("%q -> %q, want %q", in, got, want)
		}
	}
	line := strings.Replace(rl("2025-11-24T01:00:00Z", "5", "x"), `"plan_type":"x"`, `"plan_type":"prolite"`, 1)
	if p, ok := parseCodexLine([]byte(line)); !ok || p.Plan != "" {
		t.Fatalf("%+v %v", p, ok)
	}
}

// M2, M3: the state file is read through the nofollow open with a hard cap, and its windows are
// rebuilt from the validated id, the clamped percent and the parsed time only.
func TestUsageStateFileHardening(t *testing.T) {
	now := time.Date(2025, 11, 24, 12, 0, 0, 0, time.UTC)
	read := func(dir string) (UsageProvider, bool) {
		u := &usageStore{path: filepath.Join(dir, usageStateFile)}
		u.hydrate()
		return u.provider(RuntimeClaude, now)
	}
	good := `{"claude":{"five_hour":{"window":{"id":"five_hour","label":"PLANTED-LABEL","window_minutes":99999,"used_percent":100,"resets_at":"2025-11-24T15:00:00+02:00","status":"PLANTED","extra":"x"},"observed_at":"2025-11-24T11:00:00Z"},` +
		`"made_up":{"window":{"id":"made_up","used_percent":5,"resets_at":"2025-11-24T15:00:00Z"},"observed_at":"2025-11-24T11:00:00Z"},` +
		`"seven_day":{"window":{"id":"five_hour","used_percent":5,"resets_at":"2025-11-24T15:00:00Z"},"observed_at":"2025-11-24T11:00:00Z"},` +
		`"seven_day_opus":{"window":{"id":"seven_day_opus","used_percent":5,"resets_at":"PLANTED-TIME"},"observed_at":"not a time"}},` +
		`"not-a-provider":{"five_hour":{"window":{"id":"five_hour","used_percent":5},"observed_at":"2025-11-24T11:00:00Z"}}}`
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, usageStateFile), []byte(good), 0o600); err != nil {
		t.Fatal(err)
	}
	p, ok := read(dir)
	if !ok || len(p.Windows) != 1 {
		t.Fatalf("%+v %v", p, ok)
	}
	w := p.Windows[0]
	if w.ID != "five_hour" || w.WindowMinutes != 300 || w.UsedPercent != 100 || w.ResetsAt != "2025-11-24T13:00:00Z" || w.Status != "" {
		t.Fatalf("%+v", w)
	}
	if b, _ := json.Marshal(p); strings.Contains(string(b), "PLANTED") || strings.Contains(string(b), "label") {
		t.Fatalf("%s", b)
	}

	// A symlink to a good file is not followed.
	dir2 := t.TempDir()
	if err := os.Symlink(filepath.Join(dir, usageStateFile), filepath.Join(dir2, usageStateFile)); err != nil {
		t.Fatal(err)
	}
	if _, ok := read(dir2); ok && syscallNoFollow != 0 {
		t.Fatal("state file symlink followed")
	}
	// A file over the cap is refused, read or not.
	dir3 := t.TempDir()
	big := good + strings.Repeat(" ", usageStateMax)
	if err := os.WriteFile(filepath.Join(dir3, usageStateFile), []byte(big), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, ok := read(dir3); ok {
		t.Fatal("oversize state file read")
	}
	// A FIFO neither blocks nor reads.
	dir4 := t.TempDir()
	if err := syscall.Mkfifo(filepath.Join(dir4, usageStateFile), 0o600); err != nil {
		t.Skip("no mkfifo:", err)
	}
	done := make(chan bool, 1)
	go func() { _, ok := read(dir4); done <- ok }()
	select {
	case ok := <-done:
		if ok {
			t.Fatal("fifo read")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("reading a FIFO blocked")
	}
}

// M4: the state file is written through a random temp file, mode 0600, with no fixed .tmp name.
func TestUsageStateAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	// A planted symlink at the old fixed temp path must not be written through.
	victim := filepath.Join(t.TempDir(), "victim")
	if err := os.WriteFile(victim, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(victim, filepath.Join(dir, usageStateFile+".tmp")); err != nil {
		t.Fatal(err)
	}
	u := newUsageSources(dir)
	now := time.Date(2025, 11, 24, 12, 0, 0, 0, time.UTC)
	u.store.record(RuntimeClaude, UsageWindow{ID: "five_hour", WindowMinutes: 300, UsedPercent: 30, ResetsAt: "2025-11-24T15:00:00Z"}, now)
	u.store.wait()
	if b, _ := os.ReadFile(victim); string(b) != "keep" {
		t.Fatalf("wrote through the planted link: %q", b)
	}
	st, err := os.Stat(filepath.Join(dir, usageStateFile))
	if err != nil || st.Mode().Perm() != 0o600 {
		t.Fatalf("%v %v", st, err)
	}
	ents, _ := os.ReadDir(dir)
	for _, e := range ents {
		if e.Name() != usageStateFile && e.Name() != usageStateFile+".tmp" {
			t.Fatalf("temp file left behind: %s", e.Name())
		}
	}
	u3 := newUsageSources(dir)
	u3.store.hydrate()
	if p, ok := u3.store.provider(RuntimeClaude, now); !ok || p.Windows[0].UsedPercent != 30 {
		t.Fatalf("%+v %v", p, ok)
	}
}

// M5: a directory with many entries is read in bounded chunks, newest name first among those
// examined, and the walk still finds the newest date.
func TestUsageDirEntryCap(t *testing.T) {
	root := t.TempDir()
	for i := 0; i < usageMaxDirEntries+500; i++ {
		if err := os.WriteFile(filepath.Join(root, fmt.Sprintf("rollout-%05d.jsonl", i)), nil, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	names := sortedNames(root, false, func(s string) bool { return strings.HasPrefix(s, "rollout-") })
	if len(names) != usageMaxDirEntries {
		t.Fatalf("examined %d entries, want the cap %d", len(names), usageMaxDirEntries)
	}
	for i := 1; i < len(names); i++ {
		if names[i-1] < names[i] {
			t.Fatal("not newest first")
		}
	}
	// Date directories sort lexically: 2025/12/01 comes before 2025/11/30 and 2024/12/31.
	r2 := t.TempDir()
	for _, d := range []string{"2024/12/31", "2025/11/30", "2025/12/01", "2025/12/02"} {
		writeRollout(t, r2, d, "rollout-"+strings.ReplaceAll(d, "/", "-")+"T00-00-00-a.jsonl", rl(d[:4]+"-"+d[5:7]+"-"+d[8:]+"T00:00:00Z", "1", "pro"))
	}
	got := newestRollouts(r2, 3)
	if len(got) != 3 || !strings.Contains(got[0], "2025/12/02") || !strings.Contains(got[1], "2025/12/01") || !strings.Contains(got[2], "2025/11/30") {
		t.Fatalf("%v", got)
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

// r1: a missing, null or out-of-range used_percent in the cache drops the window; it is never a 0.
func TestUsageStateDropsBadPercent(t *testing.T) {
	now := time.Date(2025, 11, 24, 12, 0, 0, 0, time.UTC)
	win := func(id, pct string) string {
		return `"` + id + `":{"window":{"id":"` + id + `"` + pct + `,"resets_at":"2025-11-24T15:00:00Z"},"observed_at":"2025-11-24T11:00:00Z"}`
	}
	state := `{"claude":{` + strings.Join([]string{
		win("five_hour", ``),                          // missing
		win("seven_day", `,"used_percent":null`),      // null
		win("seven_day_opus", `,"used_percent":250`),  // above range
		win("seven_day_sonnet", `,"used_percent":-3`), // below range
	}, ",") + `}}`
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, usageStateFile), []byte(state), 0o600); err != nil {
		t.Fatal(err)
	}
	u := &usageStore{path: filepath.Join(dir, usageStateFile)}
	u.hydrate()
	if p, ok := u.provider(RuntimeClaude, now); ok {
		t.Fatalf("kept %+v", p.Windows)
	}
	// A real 0 is kept.
	if err := os.WriteFile(filepath.Join(dir, usageStateFile), []byte(`{"claude":{`+win("five_hour", `,"used_percent":0`)+`}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	u = &usageStore{path: filepath.Join(dir, usageStateFile)}
	u.hydrate()
	if p, ok := u.provider(RuntimeClaude, now); !ok || len(p.Windows) != 1 || p.Windows[0].UsedPercent != 0 {
		t.Fatalf("%+v %v", p, ok)
	}
}

// R2: the claim path reads memory only. Report neither opens the cache file nor waits on a
// writer that is mid-write; a FIFO at the cache path (a read would block) does not stall it.
func TestUsageReportNeverTouchesTheCacheFile(t *testing.T) {
	dir := t.TempDir()
	if err := syscall.Mkfifo(filepath.Join(dir, usageStateFile), 0o600); err != nil {
		t.Skip("no mkfifo:", err)
	}
	u := newUsageSources(dir)
	done := make(chan struct{})
	go func() {
		defer close(done)
		u.Report(time.Now(), "", nil)
	}()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("Report touched the cache file")
	}

	// A writer stuck in file I/O does not hold the snapshot mutex.
	s := &usageStore{path: filepath.Join(t.TempDir(), "x")}
	now := time.Now()
	s.record(RuntimeClaude, UsageWindow{ID: "five_hour", WindowMinutes: 300, UsedPercent: 10, ResetsAt: now.Add(time.Hour).UTC().Format(time.RFC3339)}, now)
	s.wmu.Lock() // a writer is "busy"
	for i := 0; i < 3; i++ {
		s.record(RuntimeClaude, UsageWindow{ID: "five_hour", WindowMinutes: 300, UsedPercent: float64(20 + i), ResetsAt: now.Add(time.Hour).UTC().Format(time.RFC3339)}, now)
	}
	got := make(chan UsageProvider, 1)
	go func() { p, _ := s.provider(RuntimeClaude, now); got <- p }()
	select {
	case p := <-got:
		if p.Windows[0].UsedPercent != 22 {
			t.Fatalf("%+v", p)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("provider blocked behind a writer")
	}
	s.wmu.Unlock()
	s.wait()
}

// R5: each Claude window carries its own observed_at; the provider's is the newest.
func TestUsagePerWindowObservedAt(t *testing.T) {
	s := &usageStore{}
	old := time.Date(2025, 11, 24, 8, 0, 0, 0, time.UTC)
	fresh := old.Add(3 * time.Hour)
	reset := "2025-11-25T00:00:00Z"
	s.record(RuntimeClaude, UsageWindow{ID: "seven_day", WindowMinutes: 10080, UsedPercent: 40, ResetsAt: reset}, old)
	s.record(RuntimeClaude, UsageWindow{ID: "five_hour", WindowMinutes: 300, UsedPercent: 10, ResetsAt: reset}, fresh)
	p, ok := s.provider(RuntimeClaude, fresh)
	if !ok || len(p.Windows) != 2 || p.ObservedAt != "2025-11-24T11:00:00Z" {
		t.Fatalf("%+v", p)
	}
	for _, w := range p.Windows {
		want := map[string]string{"five_hour": "2025-11-24T11:00:00Z", "seven_day": "2025-11-24T08:00:00Z"}[w.ID]
		if w.ObservedAt != want {
			t.Fatalf("%s observed_at %q want %q", w.ID, w.ObservedAt, want)
		}
	}
}

// R5, R6: Codex windows carry the event time, and the newest event across the candidate files wins,
// even when it sits in an older-created file (a resumed session).
func TestReadCodexUsageNewestEventAcrossFiles(t *testing.T) {
	root := filepath.Join(t.TempDir(), "sessions")
	old := writeRollout(t, root, "2025/11/22", "rollout-2025-11-22T01-00-00-a.jsonl", rl("2025-11-24T09:00:00Z", "77.0", "plus"))
	writeRollout(t, root, "2025/11/24", "rollout-2025-11-24T01-00-00-b.jsonl", rl("2025-11-24T02:00:00Z", "5.0", "plus"))
	writeRollout(t, root, "2025/11/20", "rollout-2025-11-20T01-00-00-c.jsonl", rl("2025-11-24T10:00:00Z", "99.0", "plus"))
	_ = old
	p, ok := ReadCodexUsage(root)
	if !ok || p.ObservedAt != "2025-11-24T10:00:00Z" || p.Windows[0].UsedPercent != 99 {
		t.Fatalf("%+v %v", p, ok)
	}
	for _, w := range p.Windows {
		if w.ObservedAt != "2025-11-24T10:00:00Z" {
			t.Fatalf("window observed_at %+v", w)
		}
	}
	// A fourth, older day directory is not read.
	writeRollout(t, root, "2025/11/10", "rollout-2025-11-10T01-00-00-d.jsonl", rl("2025-11-24T23:00:00Z", "88.0", "plus"))
	if p, _ := ReadCodexUsage(root); p.Windows[0].UsedPercent != 99 {
		t.Fatalf("read past the newest %d date directories: %+v", usageMaxDays, p)
	}
	// The file cap applies by modification time.
	root2 := filepath.Join(t.TempDir(), "sessions")
	for i := 0; i < usageMaxFiles+5; i++ {
		writeRollout(t, root2, "2025/11/24", fmt.Sprintf("rollout-2025-11-24T01-00-%02d-x.jsonl", i), rl("2025-11-24T01:00:00Z", "1.0", "plus"))
	}
	if n := len(candidateRollouts(root2)); n != usageMaxFiles {
		t.Fatalf("%d candidates", n)
	}
}
