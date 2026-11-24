package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Usage limits. The daemon reports how much of each subscription window a CLI says is used. It
// reads only what the CLI already writes for itself (Codex's session log) or prints on the stream
// the daemon already reads (Claude Code's rate_limit_event). It never reads, stores or sends a
// login token (ADR 0021). Field names come from openai/codex codex-rs/protocol/src/protocol.rs
// (RateLimitSnapshot, RateLimitWindow; Apache-2.0) and the Claude Agent SDK type
// SDKRateLimitInfo. Only the schemas are used.

const (
	usageSourceLog      = "cli-log"
	usageSourceStream   = "cli-stream"
	usageSourceCodexbar = "codexbar"
	usageSourceNone     = "none"

	usageTailBytes     = 256 << 10
	usageMaxFiles      = 5
	usageCodexCacheTTL = time.Minute
	usageMaxWindows    = 8
	usageStateFile     = "usage-limits.json"
)

// usageProviderIDs is the contract's id enum. Anything else is never reported.
var usageProviderIDs = map[string]bool{
	RuntimeClaude: true, RuntimeCodex: true, RuntimeGrok: true, RuntimeOpenCode: true, RuntimeAgy: true,
	"gemini": true, "cursor": true, "copilot": true, "opencode-go": true, "amp": true, "kiro": true,
	"factory": true, "windsurf": true, "kilo": true, "warp": true, "mistral": true, "zed": true, "devin": true,
}

const usageMaxProviders = 24

// usagePlans is the contract's plan enum (spec/api.tsp UsageProvider.plan). A plan value is
// reported only on an exact lowercase match after trimming; anything else is omitted. Codex's own
// PlanType (openai/codex codex-rs/protocol/src/account.rs) also has prolite, promax, ent26,
// self_serve_business_prolite, self_serve_business_usage_based, enterprise_cbp_automation,
// enterprise_cbp_usage_based, edu_plus, edu_pro, sci and sci_plus; those are not in the contract's
// set and are not reported. Claude Code's stream carries no plan.
var usagePlans = map[string]bool{
	"free": true, "go": true, "plus": true, "pro": true, "max": true, "team": true,
	"business": true, "enterprise": true, "edu": true,
}

func usagePlan(s string) string {
	s = strings.TrimSpace(s)
	if usagePlans[s] {
		return s
	}
	return ""
}

// UsageWindow is one limit window. Fields mirror spec/api.tsp UsageWindow.
type UsageWindow struct {
	ID            string  `json:"id"`
	WindowMinutes int     `json:"window_minutes,omitempty"`
	UsedPercent   float64 `json:"used_percent"`
	ResetsAt      string  `json:"resets_at,omitempty"`
	Status        string  `json:"status,omitempty"`
}

// UsageProvider is one CLI's windows and where they came from.
type UsageProvider struct {
	ID         string        `json:"id"`
	Source     string        `json:"source"`
	ObservedAt string        `json:"observed_at,omitempty"`
	Plan       string        `json:"plan,omitempty"`
	Windows    []UsageWindow `json:"windows"`
}

// UsageLimitsReport is what a claim sends as usage_limits.
type UsageLimitsReport struct {
	ReadAt    string          `json:"read_at"`
	Engine    *UsageEngine    `json:"engine,omitempty"`
	Providers []UsageProvider `json:"providers"`
}

// UsageEngine says whether the CodexBar usage engine was found on this machine (usage_codexbar.go).
type UsageEngine struct {
	ID      string `json:"id"`
	Found   bool   `json:"found"`
	Version string `json:"version,omitempty"`
}

// usageLogReader is an adapter whose CLI persists rate-limit snapshots in session logs.
type usageLogReader interface {
	UsageLogDir(home string, getenv func(string) string) string
}

// usageStreamParser is an adapter whose stream carries rate-limit events.
type usageStreamParser interface {
	ParseUsageLine(line string) (UsageWindow, bool)
}

func clampPercent(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) || v < 0 {
		return 0
	}
	if v > 100 {
		return 100
	}
	return v
}

func unixRFC3339(sec int64) string {
	if sec <= 0 {
		return ""
	}
	return time.Unix(sec, 0).UTC().Format(time.RFC3339)
}

func windowMinutesOK(m int64) int {
	if m < 1 || m > 60000 {
		return 0
	}
	return int(m)
}

// ---- Codex session log ----

type codexRateWindow struct {
	UsedPercent   *float64 `json:"used_percent"`
	WindowMinutes *int64   `json:"window_minutes"`
	ResetsAt      *int64   `json:"resets_at"`
}

// codexLine decodes only the rate-limit fields. The line's `info` and any prompt text are not
// fields of this struct, so they are dropped by the decoder.
type codexLine struct {
	Timestamp string `json:"timestamp"`
	Payload   struct {
		Type       string `json:"type"`
		RateLimits *struct {
			LimitID   string           `json:"limit_id"`
			Primary   *codexRateWindow `json:"primary"`
			Secondary *codexRateWindow `json:"secondary"`
			PlanType  string           `json:"plan_type"`
		} `json:"rate_limits"`
	} `json:"payload"`
}

func codexWindow(w *codexRateWindow, fallback string) (UsageWindow, bool) {
	if w == nil || w.UsedPercent == nil {
		return UsageWindow{}, false
	}
	out := UsageWindow{ID: fallback, UsedPercent: clampPercent(*w.UsedPercent)}
	if w.WindowMinutes != nil {
		out.WindowMinutes = windowMinutesOK(*w.WindowMinutes)
		switch *w.WindowMinutes {
		case 300:
			out.ID = "five_hour"
		case 10080:
			out.ID = "seven_day"
		}
	}
	if w.ResetsAt != nil {
		out.ResetsAt = unixRFC3339(*w.ResetsAt)
	}
	return out, true
}

// parseCodexLine returns the provider snapshot in one rollout line, if it has one.
func parseCodexLine(line []byte) (UsageProvider, bool) {
	if !bytes.Contains(line, []byte(`"rate_limits"`)) || !bytes.Contains(line, []byte(`"token_count"`)) {
		return UsageProvider{}, false
	}
	var l codexLine
	if json.Unmarshal(line, &l) != nil || l.Payload.Type != "token_count" || l.Payload.RateLimits == nil {
		return UsageProvider{}, false
	}
	// A snapshot for another named limit (a per-model quota) is not the subscription window.
	if id := l.Payload.RateLimits.LimitID; id != "" && id != "codex" {
		return UsageProvider{}, false
	}
	p := UsageProvider{ID: RuntimeCodex, Source: usageSourceLog, Windows: []UsageWindow{}}
	if w, ok := codexWindow(l.Payload.RateLimits.Primary, "primary"); ok {
		p.Windows = append(p.Windows, w)
	}
	if w, ok := codexWindow(l.Payload.RateLimits.Secondary, "secondary"); ok {
		p.Windows = append(p.Windows, w)
	}
	if len(p.Windows) == 0 {
		return UsageProvider{}, false
	}
	if t, err := time.Parse(time.RFC3339Nano, l.Timestamp); err == nil {
		p.ObservedAt = t.UTC().Format(time.RFC3339)
	}
	p.Plan = usagePlan(l.Payload.RateLimits.PlanType)
	return p, true
}

// usageMaxDirEntries bounds how many entries of one directory are examined. The log tree is the
// CLI's own, but a runaway directory must not stall the reader. Date directories sort lexically
// (YYYY, MM, DD), so within the examined entries the newest name still comes first; past the cap the
// rest of that directory is not looked at.
const usageMaxDirEntries = 4096

// sortedNames lists a directory's entries of one kind, newest name first. A symlink is not a
// directory or regular file here, so the walk never leaves the sessions directory.
func sortedNames(dir string, wantDir bool, ok func(string) bool) []string {
	f, err := os.Open(dir)
	if err != nil {
		return nil
	}
	defer f.Close()
	var names []string
	for seen := 0; seen < usageMaxDirEntries; {
		ents, err := f.ReadDir(256)
		for _, e := range ents {
			seen++
			t := e.Type()
			if wantDir && !t.IsDir() || !wantDir && !t.IsRegular() || !ok(e.Name()) {
				continue
			}
			names = append(names, e.Name())
			if seen >= usageMaxDirEntries {
				break
			}
		}
		if err != nil || len(ents) == 0 {
			break
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(names)))
	return names
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

// newestRollouts returns up to n rollout files under sessions/YYYY/MM/DD, newest first.
func newestRollouts(root string, n int) []string {
	var out []string
	for _, y := range sortedNames(root, true, allDigits) {
		for _, m := range sortedNames(filepath.Join(root, y), true, allDigits) {
			for _, d := range sortedNames(filepath.Join(root, y, m), true, allDigits) {
				dir := filepath.Join(root, y, m, d)
				for _, f := range sortedNames(dir, false, func(s string) bool {
					return strings.HasPrefix(s, "rollout-") && strings.HasSuffix(s, ".jsonl")
				}) {
					out = append(out, filepath.Join(dir, f))
					if len(out) >= n {
						return out
					}
				}
			}
		}
	}
	return out
}

// readTail returns the last usageTailBytes of a regular file, opened without following a symlink.
// A partial first line is dropped.
func readTail(path string) ([]byte, time.Time, error) {
	f, err := os.OpenFile(path, os.O_RDONLY|syscallNoFollow|syscallNonblock, 0)
	if err != nil {
		return nil, time.Time{}, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() {
		return nil, time.Time{}, os.ErrInvalid
	}
	off := int64(0)
	if st.Size() > usageTailBytes {
		off = st.Size() - usageTailBytes
	}
	buf := make([]byte, st.Size()-off)
	if _, err := f.ReadAt(buf, off); err != nil && err != io.EOF {
		return nil, time.Time{}, err
	}
	if off > 0 {
		if i := bytes.IndexByte(buf, '\n'); i >= 0 {
			buf = buf[i+1:]
		} else {
			buf = nil
		}
	}
	return buf, st.ModTime(), nil
}

// ReadCodexUsage returns the last rate-limit snapshot in the newest rollout files under sessions,
// or false when there is none.
func ReadCodexUsage(sessions string) (UsageProvider, bool) {
	for _, path := range newestRollouts(sessions, usageMaxFiles) {
		buf, mtime, err := readTail(path)
		if err != nil {
			continue
		}
		lines := bytes.Split(buf, []byte{'\n'})
		for i := len(lines) - 1; i >= 0; i-- {
			if p, ok := parseCodexLine(lines[i]); ok {
				if p.ObservedAt == "" {
					p.ObservedAt = mtime.UTC().Format(time.RFC3339)
				}
				return p, true
			}
		}
	}
	return UsageProvider{}, false
}

// ---- Claude Code stream ----

// parseClaudeRateLimit reads a rate_limit_event line. utilization is not documented as a fraction
// or a percent: a value at or below 1 is taken as a fraction (x100), a larger one as a percent,
// and the result is clamped to 0..100. A reading of exactly 1 is therefore 100 percent, and a
// real 1 percent reads as 100; the assumption is recorded in the change's evidence.
func parseClaudeRateLimit(line string) (UsageWindow, bool) {
	if !strings.HasPrefix(line, "{") || !strings.Contains(line, `"rate_limit_event"`) {
		return UsageWindow{}, false
	}
	var ev struct {
		Type string `json:"type"`
		Info struct {
			Status        string   `json:"status"`
			ResetsAt      *float64 `json:"resetsAt"`
			RateLimitType string   `json:"rateLimitType"`
			Utilization   *float64 `json:"utilization"`
		} `json:"rate_limit_info"`
	}
	if json.Unmarshal([]byte(line), &ev) != nil || ev.Type != "rate_limit_event" || ev.Info.Utilization == nil {
		return UsageWindow{}, false
	}
	w := UsageWindow{ID: ev.Info.RateLimitType}
	switch w.ID {
	case "five_hour":
		w.WindowMinutes = 300
	case "seven_day", "seven_day_opus", "seven_day_sonnet":
		w.WindowMinutes = 10080
	default:
		return UsageWindow{}, false // overage and unknown types are not reported
	}
	u := *ev.Info.Utilization
	if math.IsNaN(u) || math.IsInf(u, 0) {
		return UsageWindow{}, false
	}
	if u <= 1 {
		u *= 100
	}
	w.UsedPercent = clampPercent(u)
	switch ev.Info.Status {
	case "allowed":
		w.Status = "allowed"
	case "allowed_warning":
		w.Status = "warning"
	case "rejected":
		w.Status = "rejected"
	}
	if ev.Info.ResetsAt != nil && *ev.Info.ResetsAt > 0 && *ev.Info.ResetsAt < 1e12 {
		w.ResetsAt = unixRFC3339(int64(*ev.Info.ResetsAt))
	}
	return w, true
}

type usageStamped struct {
	Window     UsageWindow `json:"window"`
	ObservedAt string      `json:"observed_at"`
}

// usageStore keeps the latest stream window per provider and window id, in memory and in a small
// file in the daemon's home so a restart does not lose it. The file holds percentages and times only.
type usageStore struct {
	mu     sync.Mutex
	path   string
	loaded bool
	byProv map[string]map[string]usageStamped
}

func (s *usageStore) load() {
	if s.loaded {
		return
	}
	s.loaded = true
	s.byProv = map[string]map[string]usageStamped{}
	if s.path == "" {
		return
	}
	b, err := readCappedFile(s.path, usageStateMax)
	if err != nil {
		return
	}
	var m map[string]map[string]usageStamped
	if json.Unmarshal(b, &m) != nil {
		return
	}
	for prov, ws := range m {
		if !usageProviderIDs[prov] {
			continue
		}
		for id, st := range ws {
			w, ok := rebuildStreamWindow(id, st.Window)
			obs, err := time.Parse(time.RFC3339, st.ObservedAt)
			if !ok || err != nil {
				continue
			}
			if s.byProv[prov] == nil {
				s.byProv[prov] = map[string]usageStamped{}
			}
			s.byProv[prov][id] = usageStamped{Window: w, ObservedAt: obs.UTC().Format(time.RFC3339)}
		}
	}
}

// usageStateMax is the hard cap on the state file read.
const usageStateMax = 64 << 10

// readCappedFile reads a regular file without following a symlink or blocking on a FIFO. The file
// is opened first and checked with fstat, then read through a hard cap; a file over max is refused.
func readCappedFile(path string, max int64) ([]byte, error) {
	f, err := os.OpenFile(path, os.O_RDONLY|syscallNoFollow|syscallNonblock, 0)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	st, err := f.Stat()
	if err != nil || !st.Mode().IsRegular() || st.Size() > max {
		return nil, os.ErrInvalid
	}
	b, err := io.ReadAll(io.LimitReader(f, max+1))
	if err != nil || int64(len(b)) > max {
		return nil, os.ErrInvalid
	}
	return b, nil
}

// streamWindowMinutes is the window length of each id a Claude stream window may carry.
func streamWindowMinutes(id string) (int, bool) {
	switch id {
	case "five_hour":
		return 300, true
	case "seven_day", "seven_day_opus", "seven_day_sonnet":
		return 10080, true
	}
	return 0, false
}

// rebuildStreamWindow builds a window from the validated id, the clamped percent and the parsed
// reset time only, so nothing else in a state file's window object reaches the report. A status is
// kept only when it is one of the contract's values.
func rebuildStreamWindow(id string, in UsageWindow) (UsageWindow, bool) {
	mins, ok := streamWindowMinutes(id)
	if !ok || in.ID != id || math.IsNaN(in.UsedPercent) || math.IsInf(in.UsedPercent, 0) {
		return UsageWindow{}, false
	}
	out := UsageWindow{ID: id, WindowMinutes: mins, UsedPercent: clampPercent(in.UsedPercent)}
	if t, err := time.Parse(time.RFC3339, in.ResetsAt); err == nil {
		out.ResetsAt = t.UTC().Format(time.RFC3339)
	}
	switch in.Status {
	case "allowed", "warning", "rejected":
		out.Status = in.Status
	}
	return out, true
}

func (s *usageStore) record(provider string, w UsageWindow, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.load()
	if s.byProv[provider] == nil {
		s.byProv[provider] = map[string]usageStamped{}
	}
	s.byProv[provider][w.ID] = usageStamped{Window: w, ObservedAt: now.UTC().Format(time.RFC3339)}
	if s.path == "" {
		return
	}
	if b, err := json.Marshal(s.byProv); err == nil {
		_ = writeFileAtomic(s.path, b)
	}
}

// writeFileAtomic writes through a random temporary file in the same directory (mode 0600), syncs
// it and renames it over path, so a reader never sees a partial file and no fixed temp name can be
// planted.
func writeFileAtomic(path string, b []byte) error {
	f, err := os.CreateTemp(filepath.Dir(path), filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmp := f.Name()
	ok := false
	defer func() {
		if !ok {
			_ = os.Remove(tmp)
		}
	}()
	if err := f.Chmod(0o600); err != nil {
		f.Close()
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		return err
	}
	ok = true
	return nil
}

// provider returns the stored windows whose reset time has not passed, or false when none remain.
func (s *usageStore) provider(id string, now time.Time) (UsageProvider, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.load()
	p := UsageProvider{ID: id, Source: usageSourceStream, Windows: []UsageWindow{}}
	var newest time.Time
	for _, st := range s.byProv[id] {
		if t, err := time.Parse(time.RFC3339, st.Window.ResetsAt); err == nil && !t.After(now) {
			continue // the window has reset; its old percentage no longer holds
		}
		p.Windows = append(p.Windows, st.Window)
		if t, err := time.Parse(time.RFC3339, st.ObservedAt); err == nil && t.After(newest) {
			newest = t
		}
	}
	if len(p.Windows) == 0 {
		return UsageProvider{}, false
	}
	sort.Slice(p.Windows, func(i, j int) bool { return p.Windows[i].ID < p.Windows[j].ID })
	p.ObservedAt = newest.UTC().Format(time.RFC3339)
	return p, true
}

// usageSources builds the report. Codex's log is read by a background refresher (startLogs), never
// in the claim path: Report only reads the last snapshot.
type usageSources struct {
	store usageStore

	mu       sync.Mutex
	logCache map[string]*UsageProvider
	logEvery time.Duration
	logOnce  sync.Once

	// cb is the CodexBar engine's cache, set by startEngine. Report only reads it.
	cb         atomic.Pointer[codexbarEngine]
	engineOnce sync.Once
}

func newUsageSources(home string) *usageSources {
	u := &usageSources{logCache: map[string]*UsageProvider{}, logEvery: usageCodexCacheTTL}
	if home != "" {
		u.store.path = filepath.Join(home, usageStateFile)
	}
	return u
}

// refreshLogs reads every log-reading adapter's newest snapshot and replaces the cache.
func (u *usageSources) refreshLogs(userHome string, getenv func(string) string) {
	for _, a := range RegisteredAdapters() {
		r, ok := a.(usageLogReader)
		if !ok || !listsSubscription(a) || !usageProviderIDs[a.ID()] {
			continue
		}
		var got *UsageProvider
		if dir := r.UsageLogDir(userHome, getenv); dir != "" {
			if p, ok := ReadCodexUsage(dir); ok {
				p.ID = a.ID()
				got = &p
			}
		}
		u.mu.Lock()
		u.logCache[a.ID()] = got
		u.mu.Unlock()
	}
}

// startLogs starts the background log reader once: it reads at once, then at most every minute,
// until ctx ends.
func (u *usageSources) startLogs(ctx context.Context, userHome string, getenv func(string) string) {
	u.logOnce.Do(func() {
		go func() {
			t := time.NewTimer(0)
			defer t.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-t.C:
				}
				u.refreshLogs(userHome, getenv)
				t.Reset(u.logEvery)
			}
		}()
	})
}

// fromLog returns the last snapshot the refresher stored. It touches no file.
func (u *usageSources) fromLog(a Adapter) (UsageProvider, bool) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if p := u.logCache[a.ID()]; p != nil {
		return *p, true
	}
	return UsageProvider{}, false
}

// Report builds usage_limits for the registered subscription CLIs. A CLI with no source gets
// source "none" and no windows, never a zero.
func (u *usageSources) Report(now time.Time, _ string, _ func(string) string) *UsageLimitsReport {
	rep := &UsageLimitsReport{ReadAt: now.UTC().Format(time.RFC3339), Providers: []UsageProvider{}}
	for _, a := range RegisteredAdapters() {
		if !listsSubscription(a) || !usageProviderIDs[a.ID()] {
			continue
		}
		var p UsageProvider
		got := false
		if _, ok := a.(usageLogReader); ok {
			p, got = u.fromLog(a)
		}
		if !got {
			if _, ok := a.(usageStreamParser); ok {
				p, got = u.store.provider(a.ID(), now)
			}
		}
		if !got {
			p = UsageProvider{ID: a.ID(), Source: usageSourceNone, Windows: []UsageWindow{}}
		}
		if len(p.Windows) > usageMaxWindows {
			p.Windows = p.Windows[:usageMaxWindows]
		}
		rep.Providers = append(rep.Providers, p)
	}
	if e := u.cb.Load(); e != nil {
		rep.Engine, rep.Providers = mergeCodexbar(rep.Providers, e)
	}
	return rep
}
