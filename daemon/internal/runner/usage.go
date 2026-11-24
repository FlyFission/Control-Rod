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
	usageMaxFiles      = 20
	usageMaxDays       = 3
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
	// ObservedAt is when this window's reading was taken (RFC 3339). The provider's ObservedAt is
	// the newest of its windows'; a window can be older than that.
	ObservedAt string `json:"observed_at,omitempty"`
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
	p, _, ok := parseCodexLineAt(line)
	return p, ok
}

// parseCodexLineAt is parseCodexLine plus the event's own time at full precision (zero when the
// line has none). The provider's ObservedAt is the same instant formatted to the second; selection
// compares the parsed time, so events within one second still order.
func parseCodexLineAt(line []byte) (UsageProvider, time.Time, bool) {
	// Cheap substring checks first: most lines are not quota events and are never JSON-decoded.
	if !bytes.Contains(line, []byte(`"token_count"`)) || !bytes.Contains(line, []byte(`"rate_limits"`)) {
		return UsageProvider{}, time.Time{}, false
	}
	var l codexLine
	if json.Unmarshal(line, &l) != nil || l.Payload.Type != "token_count" || l.Payload.RateLimits == nil {
		return UsageProvider{}, time.Time{}, false
	}
	// A snapshot for another named limit (a per-model quota) is not the subscription window.
	if id := l.Payload.RateLimits.LimitID; id != "" && id != "codex" {
		return UsageProvider{}, time.Time{}, false
	}
	p := UsageProvider{ID: RuntimeCodex, Source: usageSourceLog, Windows: []UsageWindow{}}
	if w, ok := codexWindow(l.Payload.RateLimits.Primary, "primary"); ok {
		p.Windows = append(p.Windows, w)
	}
	if w, ok := codexWindow(l.Payload.RateLimits.Secondary, "secondary"); ok {
		p.Windows = append(p.Windows, w)
	}
	if len(p.Windows) == 0 {
		return UsageProvider{}, time.Time{}, false
	}
	var at time.Time
	if t, err := time.Parse(time.RFC3339Nano, l.Timestamp); err == nil {
		at = t.UTC()
		p.ObservedAt = at.Format(time.RFC3339)
	}
	p.Plan = usagePlan(l.Payload.RateLimits.PlanType)
	stampWindows(&p)
	return p, at, true
}

// stampWindows gives every window of p that has no time of its own the provider's observed_at.
func stampWindows(p *UsageProvider) {
	for i := range p.Windows {
		if p.Windows[i].ObservedAt == "" {
			p.Windows[i].ObservedAt = p.ObservedAt
		}
	}
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

// newestRollouts returns up to n rollout files under sessions/YYYY/MM/DD, newest name first.
func newestRollouts(root string, n int) []string {
	var out []string
	for _, y := range sortedNames(root, true, allDigits) {
		for _, m := range sortedNames(filepath.Join(root, y), true, allDigits) {
			for _, d := range sortedNames(filepath.Join(root, y, m), true, allDigits) {
				dir := filepath.Join(root, y, m, d)
				for _, f := range rolloutNames(dir) {
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

func rolloutNames(dir string) []string {
	return sortedNames(dir, false, func(s string) bool {
		return strings.HasPrefix(s, "rollout-") && strings.HasSuffix(s, ".jsonl")
	})
}

// candidateRollouts returns the files the reader looks at: the rollouts in the newest
// usageMaxDays date directories that hold any, the usageMaxFiles most recently modified of them.
// A session resumed from an older day appends to its old file, so the newest quota event is not
// always in the newest-created file; modification time finds it.
func candidateRollouts(root string) []string {
	type cand struct {
		path string
		mod  time.Time
	}
	var cs []cand
	days := 0
walk:
	for _, y := range sortedNames(root, true, allDigits) {
		for _, m := range sortedNames(filepath.Join(root, y), true, allDigits) {
			for _, d := range sortedNames(filepath.Join(root, y, m), true, allDigits) {
				dir := filepath.Join(root, y, m, d)
				names := rolloutNames(dir)
				if len(names) == 0 {
					continue
				}
				for _, f := range names {
					p := filepath.Join(dir, f)
					if st, err := os.Lstat(p); err == nil && st.Mode().IsRegular() {
						cs = append(cs, cand{p, st.ModTime()})
					}
				}
				if days++; days >= usageMaxDays {
					break walk
				}
			}
		}
	}
	sort.SliceStable(cs, func(i, j int) bool { return cs[i].mod.After(cs[j].mod) })
	if len(cs) > usageMaxFiles {
		cs = cs[:usageMaxFiles]
	}
	out := make([]string, len(cs))
	for i, c := range cs {
		out[i] = c.path
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

// ReadCodexUsage returns the newest rate-limit snapshot (by the event's own timestamp) across the
// candidate rollout files under sessions, or false when there is none.
//
// What is read: for each candidate file, at most the last usageTailBytes of raw bytes of Codex's own
// session log, held in memory only for the scan of that file. That tail can contain prompt and tool
// text, because the log interleaves it with the quota events. A line is JSON-decoded only if it
// contains both "token_count" and "rate_limits", and the decoder's struct (codexLine) has only the
// rate_limits fields, so everything else in the line is dropped by the decoder. What is kept is the
// percentages, window lengths, reset times, plan and event time. The buffer is not retained: it is
// released before the next file is read, and nothing is written to disk or sent.
func ReadCodexUsage(sessions string) (UsageProvider, bool) {
	var best UsageProvider
	var bestAt time.Time
	have := false
	for _, path := range candidateRollouts(sessions) {
		p, at, ok := newestCodexInFile(path)
		if ok && (!have || at.After(bestAt)) {
			best, bestAt, have = p, at, true
		}
	}
	return best, have
}

// newestCodexInFile scans one file's tail from the end for the last quota event.
func newestCodexInFile(path string) (UsageProvider, time.Time, bool) {
	buf, mtime, err := readTail(path)
	if err != nil {
		return UsageProvider{}, time.Time{}, false
	}
	for end := len(buf); end > 0; {
		start := bytes.LastIndexByte(buf[:end], '\n') + 1
		if p, at, ok := parseCodexLineAt(buf[start:end]); ok {
			if p.ObservedAt == "" {
				at = mtime.UTC()
				p.ObservedAt = at.Format(time.RFC3339)
				stampWindows(&p)
			}
			return p, at, true // strings are copies; buf is released on return
		}
		end = start - 1
	}
	return UsageProvider{}, time.Time{}, false
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
//
// The claim path reads only the in-memory map (provider). The file is read once by hydrate and
// written by persist, both on background goroutines; mu guards the map alone and is never held
// across file I/O. wmu serializes writers, and seq lets a writer skip a snapshot a later one has
// already superseded.
type usageStore struct {
	mu     sync.Mutex
	path   string
	byProv map[string]map[string]usageStamped
	seq    uint64

	hydrateOnce sync.Once
	wmu         sync.Mutex
	written     uint64
	wg          sync.WaitGroup

	// dirty has capacity 1: a change sends without blocking, and the one worker flushes once per
	// token it takes, so a stalled disk leaves at most one flush pending however many records arrive.
	dirty      chan struct{}
	workerOnce sync.Once
}

// usageStampedFile is the on-disk shape. used_percent is a pointer so a missing or null value is
// told from a real 0.
type usageStampedFile struct {
	Window struct {
		ID          string   `json:"id"`
		UsedPercent *float64 `json:"used_percent"`
		ResetsAt    string   `json:"resets_at"`
		Status      string   `json:"status"`
	} `json:"window"`
	ObservedAt string `json:"observed_at"`
}

// start hydrates from the file in the background. Report does not wait for it.
func (s *usageStore) start() {
	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		s.hydrate()
	}()
}

// hydrate reads the state file once and merges it under what is already in memory (a window
// recorded since startup is newer than the file's). The read happens outside mu.
func (s *usageStore) hydrate() {
	s.hydrateOnce.Do(func() {
		var m map[string]map[string]usageStampedFile
		if s.path != "" {
			if b, err := readCappedFile(s.path, usageStateMax); err == nil && json.Unmarshal(b, &m) != nil {
				m = nil
			}
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if s.byProv == nil {
			s.byProv = map[string]map[string]usageStamped{}
		}
		for prov, ws := range m {
			if !usageProviderIDs[prov] {
				continue
			}
			for id, st := range ws {
				w, ok := rebuildStreamWindow(id, st.Window.ID, st.Window.UsedPercent, st.Window.ResetsAt, st.Window.Status)
				obs, err := time.Parse(time.RFC3339, st.ObservedAt)
				if !ok || err != nil {
					continue
				}
				if s.byProv[prov] == nil {
					s.byProv[prov] = map[string]usageStamped{}
				}
				if _, have := s.byProv[prov][id]; have {
					continue
				}
				s.byProv[prov][id] = usageStamped{Window: w, ObservedAt: obs.UTC().Format(time.RFC3339)}
			}
		}
	})
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

// rebuildStreamWindow builds a window from the validated id, the percent and the parsed reset
// time only, so nothing else in a state file's window object reaches the report. The window is
// dropped when the percent is missing, null, not finite or outside 0..100. A status is kept only
// when it is one of the contract's values.
func rebuildStreamWindow(id, inID string, pct *float64, resetsAt, status string) (UsageWindow, bool) {
	mins, ok := streamWindowMinutes(id)
	if !ok || inID != id || pct == nil || math.IsNaN(*pct) || math.IsInf(*pct, 0) || *pct < 0 || *pct > 100 {
		return UsageWindow{}, false
	}
	out := UsageWindow{ID: id, WindowMinutes: mins, UsedPercent: *pct}
	if t, err := time.Parse(time.RFC3339, resetsAt); err == nil {
		out.ResetsAt = t.UTC().Format(time.RFC3339)
	}
	switch status {
	case "allowed", "warning", "rejected":
		out.Status = status
	}
	return out, true
}

// record stores the window in memory at once and persists in the background.
func (s *usageStore) record(provider string, w UsageWindow, now time.Time) {
	s.mu.Lock()
	if s.byProv == nil {
		s.byProv = map[string]map[string]usageStamped{}
	}
	if s.byProv[provider] == nil {
		s.byProv[provider] = map[string]usageStamped{}
	}
	s.byProv[provider][w.ID] = usageStamped{Window: w, ObservedAt: now.UTC().Format(time.RFC3339)}
	s.mu.Unlock()
	if s.path == "" {
		return
	}
	s.workerOnce.Do(func() {
		s.dirty = make(chan struct{}, 1)
		go s.persistWorker()
	})
	s.wg.Add(1) // one count per queued flush, released by the worker after it runs
	select {
	case s.dirty <- struct{}{}:
	default: // a flush is already pending and will read the newest state
		s.wg.Done()
	}
}

// persistWorker is the one writer. It lives for the daemon's life; wg counts queued flushes.
func (s *usageStore) persistWorker() {
	for range s.dirty {
		s.persist()
		s.wg.Done()
	}
}

// persist writes the current map. It hydrates first, so the file is never overwritten with less
// than it held. The snapshot is marshalled under mu; the write happens outside it, under wmu.
func (s *usageStore) persist() {
	s.hydrate()
	s.wmu.Lock()
	defer s.wmu.Unlock()
	s.mu.Lock()
	s.seq++
	seq := s.seq
	b, err := json.Marshal(s.byProv)
	s.mu.Unlock()
	if err != nil || seq <= s.written {
		return
	}
	if writeFileAtomic(s.path, b) == nil {
		s.written = seq
	}
}

// wait blocks until background hydrate and persist calls have finished (tests).
func (s *usageStore) wait() { s.wg.Wait() }

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
// It reads memory only: no file is opened on the claim path.
func (s *usageStore) provider(id string, now time.Time) (UsageProvider, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p := UsageProvider{ID: id, Source: usageSourceStream, Windows: []UsageWindow{}}
	var newest time.Time
	for _, st := range s.byProv[id] {
		if t, err := time.Parse(time.RFC3339, st.Window.ResetsAt); err == nil && !t.After(now) {
			continue // the window has reset; its old percentage no longer holds
		}
		w := st.Window
		w.ObservedAt = st.ObservedAt
		p.Windows = append(p.Windows, w)
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

	storeOnce sync.Once

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

// startStore hydrates the stream cache from its file in the background, once.
func (u *usageSources) startStore() { u.storeOnce.Do(u.store.start) }

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
