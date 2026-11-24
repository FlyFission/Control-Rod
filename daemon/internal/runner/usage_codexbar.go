package runner

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"
)

// CodexBar as the usage engine for harnesses that have no token-free source (owner decision
// 2026-11-24). CodexBar (MIT, github.com/steipete/CodexBar) is installed and signed in by the
// person; it does its own sign-in work. Control Rod runs its `codexbar usage --format json`
// command and keeps only percentages, window lengths, reset times, window labels and the fetch
// time. It never reads a token, and it drops every other field the command prints (account,
// email, identity, diagnostic, error text, credits, dashboards, status).
//
// JSON shape relied on (CodexBar docs/cli.md; Sources/CodexBarCLI/CLIPayloads.swift ProviderPayload;
// Sources/CodexBarCore/UsageFetcher.swift RateWindow, UsageSnapshot; dates are JSONEncoder
// .iso8601 per CLIErrorReporting.encodeJSON): a top-level array, one entry per provider:
//
//	[{"provider":"claude","source":"oauth","usage":{"primary":{"usedPercent":42,"windowMinutes":300,
//	  "resetsAt":"2026-11-24T15:00:00Z"},"secondary":{...},"tertiary":{...},
//	  "updatedAt":"2026-11-24T12:00:00Z"},"rateWindowLabels":{"primary":"Session","secondary":"Weekly"},
//	  "error":null}]
//
// An entry that failed has `error` set and no `usage`; it produces no provider here.

const (
	codexbarEnv           = "CONTROLROD_CODEXBAR"
	codexbarMaxOutput     = 2 << 20
	codexbarRunTimeout    = 60 * time.Second
	codexbarVersionLimit  = 10 * time.Second
	codexbarInterval      = 5 * time.Minute
	codexbarInitialDelay  = 5 * time.Second
	codexbarKillWaitDelay = 2 * time.Second
)

var (
	codexbarFixedPaths = []string{
		"/opt/homebrew/bin/codexbar",
		"/usr/local/bin/codexbar",
		"/Applications/CodexBar.app/Contents/Helpers/CodexBarCLI",
	}
	codexbarVersionRE = regexp.MustCompile(`^[0-9A-Za-z.+-]{1,32}$`)
)

// codexbarIDs maps CodexBar provider ids to ours. Ids not listed are not reported.
var codexbarIDs = map[string]string{
	"claude": "claude", "codex": "codex", "gemini": "gemini", "antigravity": "agy", "cursor": "cursor",
	"copilot": "copilot", "opencode": "opencode", "opencodego": "opencode-go", "grok": "grok",
	"amp": "amp", "kiro": "kiro", "factory": "factory", "windsurf": "windsurf", "kilo": "kilo",
	"warp": "warp", "mistral": "mistral", "zed": "zed", "devin": "devin",
}

// ---- parsing ----

type cbWindow struct {
	UsedPercent   *float64 `json:"usedPercent"`
	WindowMinutes *int64   `json:"windowMinutes"`
	ResetsAt      string   `json:"resetsAt"`
	Placeholder   bool     `json:"isSyntheticPlaceholder"`
}

// cbEntry decodes only the fields kept. account, version, status, credits, openaiDashboard,
// diagnostic, error text and the usage identity are not fields of this struct, so the decoder
// drops them. `error` is read only as present or absent.
type cbEntry struct {
	Provider string `json:"provider"`
	Usage    *struct {
		Primary   *cbWindow       `json:"primary"`
		Secondary *cbWindow       `json:"secondary"`
		Tertiary  *cbWindow       `json:"tertiary"`
		UpdatedAt json.RawMessage `json:"updatedAt"`
	} `json:"usage"`
	Labels *struct {
		Primary   *string `json:"primary"`
		Secondary *string `json:"secondary"`
		Tertiary  *string `json:"tertiary"`
	} `json:"rateWindowLabels"`
	Error json.RawMessage `json:"error"`
}

// sanitizeUsageLabel reduces an engine label to the contract's pattern
// ^[A-Za-z0-9 ()/.,+-]{1,40}$. Other characters are dropped. An empty result gives "".
func sanitizeUsageLabel(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'A' && r <= 'Z', r >= 'a' && r <= 'z', r >= '0' && r <= '9':
		case unicode.IsSpace(r):
			r = ' '
		case strings.ContainsRune("()/.,+-", r):
		default:
			continue
		}
		b.WriteRune(r)
	}
	out := strings.Join(strings.Fields(b.String()), " ")
	if len(out) > 40 {
		out = strings.TrimSpace(out[:40])
	}
	return out
}

func parseCBTime(raw string) string {
	t, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		return ""
	}
	return t.UTC().Format(time.RFC3339)
}

func cbWindowID(minutes int, slot string) string {
	switch {
	case minutes == 300:
		return "five_hour"
	case minutes == 10080:
		return "seven_day"
	case minutes == 1440:
		return "daily"
	case minutes >= 40000 && minutes <= 45000:
		return "monthly"
	}
	return slot
}

// parseCodexbarEntry returns the provider reading for one entry, or false when the entry is an
// error, has no usage, is for an id not mapped, or has no measured window.
func parseCodexbarEntry(raw []byte, fetched time.Time) (UsageProvider, bool) {
	var e cbEntry
	if json.Unmarshal(raw, &e) != nil || e.Usage == nil {
		return UsageProvider{}, false
	}
	if len(e.Error) > 0 && !bytes.Equal(bytes.TrimSpace(e.Error), []byte("null")) {
		return UsageProvider{}, false
	}
	id, ok := codexbarIDs[e.Provider]
	if !ok {
		return UsageProvider{}, false
	}
	p := UsageProvider{ID: id, Source: usageSourceCodexbar, Windows: []UsageWindow{}}
	used := map[string]bool{}
	slots := []struct {
		name  string
		w     *cbWindow
		label *string
	}{{"primary", e.Usage.Primary, nil}, {"secondary", e.Usage.Secondary, nil}, {"tertiary", e.Usage.Tertiary, nil}}
	if e.Labels != nil {
		slots[0].label, slots[1].label, slots[2].label = e.Labels.Primary, e.Labels.Secondary, e.Labels.Tertiary
	}
	for _, s := range slots {
		w := s.w
		if w == nil || w.UsedPercent == nil || w.Placeholder || math.IsNaN(*w.UsedPercent) || math.IsInf(*w.UsedPercent, 0) {
			continue
		}
		out := UsageWindow{UsedPercent: clampPercent(*w.UsedPercent)}
		if w.WindowMinutes != nil {
			out.WindowMinutes = windowMinutesOK(*w.WindowMinutes)
		}
		out.ID = cbWindowID(out.WindowMinutes, s.name)
		if used[out.ID] {
			out.ID = s.name // two windows of one length keep their slot names
		}
		used[out.ID] = true
		out.ResetsAt = parseCBTime(w.ResetsAt)
		if s.label != nil {
			out.Label = sanitizeUsageLabel(*s.label)
		}
		p.Windows = append(p.Windows, out)
	}
	if len(p.Windows) == 0 {
		return UsageProvider{}, false
	}
	var upd string
	if len(e.Usage.UpdatedAt) > 0 && json.Unmarshal(e.Usage.UpdatedAt, &upd) == nil {
		p.ObservedAt = parseCBTime(upd)
	}
	if p.ObservedAt == "" && !fetched.IsZero() {
		p.ObservedAt = fetched.UTC().Format(time.RFC3339)
	}
	return p, true
}

// parseCodexbarUsage parses the command's stdout. One bad entry does not drop the others. A
// provider id appearing twice keeps its first reading.
func parseCodexbarUsage(out []byte, fetched time.Time) []UsageProvider {
	out = bytes.TrimSpace(out)
	var entries []json.RawMessage
	switch {
	case bytes.HasPrefix(out, []byte("[")):
		if json.Unmarshal(out, &entries) != nil {
			return nil
		}
	case bytes.HasPrefix(out, []byte("{")):
		entries = []json.RawMessage{out}
	default:
		return nil
	}
	var res []UsageProvider
	seen := map[string]bool{}
	for _, raw := range entries {
		p, ok := parseCodexbarEntry(raw, fetched)
		if !ok || seen[p.ID] {
			continue
		}
		seen[p.ID] = true
		res = append(res, p)
	}
	return res
}

// ---- running ----

// capWriter keeps at most max bytes and fails the write past that, which ends the child's output.
type capWriter struct {
	buf      bytes.Buffer
	max      int
	overflow bool
}

func (c *capWriter) Write(p []byte) (int, error) {
	if c.buf.Len()+len(p) > c.max {
		c.overflow = true
		return 0, errors.New("output cap reached")
	}
	return c.buf.Write(p)
}

// runCodexbar runs path with args and returns stdout, capped. The process runs in its own
// process group, which is killed on timeout. Stdin is /dev/null and stderr is discarded.
// CODEXBAR_DISABLE_KEYCHAIN_ACCESS=1 blocks CodexBar's own Keychain operations on macOS.
func runCodexbar(path string, timeout time.Duration, limit int, args ...string) ([]byte, error) {
	cmd := exec.Command(path, args...)
	cmd.Env = append(os.Environ(), "CODEXBAR_DISABLE_KEYCHAIN_ACCESS=1", "NO_COLOR=1")
	setProcessGroup(cmd)
	cmd.WaitDelay = codexbarKillWaitDelay
	w := &capWriter{max: limit}
	cmd.Stdout = w
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case err := <-done:
		if w.overflow {
			return nil, errors.New("codexbar output over the cap")
		}
		if err != nil {
			return nil, err
		}
		return w.buf.Bytes(), nil
	case <-timer.C:
		killProcessGroup(cmd)
		<-done
		return nil, context.DeadlineExceeded
	}
}

func parseCodexbarVersion(out []byte) string {
	if !utf8.Valid(out) {
		return ""
	}
	f := strings.Fields(string(out))
	if len(f) >= 2 && f[0] == "CodexBar" && codexbarVersionRE.MatchString(f[1]) {
		return f[1]
	}
	return ""
}

// ---- the engine ----

// codexbarEngine runs CodexBar in the background and caches the narrowed result. Report reads
// the cache and never waits for the process.
type codexbarEngine struct {
	getenv   func(string) string
	lookPath func(string) (string, error)
	fixed    []string

	timeout      time.Duration
	interval     time.Duration
	initialDelay time.Duration
	now          func() time.Time

	mu        sync.Mutex
	located   bool
	disabled  bool
	found     bool
	path      string
	version   string
	providers []UsageProvider
}

func newCodexbarEngine() *codexbarEngine {
	return &codexbarEngine{
		getenv: os.Getenv, lookPath: exec.LookPath, fixed: codexbarFixedPaths,
		timeout: codexbarRunTimeout, interval: codexbarInterval, initialDelay: codexbarInitialDelay,
		now: time.Now,
	}
}

func isExecutableFile(p string) bool {
	st, err := os.Stat(p)
	return err == nil && st.Mode().IsRegular() && st.Mode().Perm()&0o111 != 0
}

// locate finds the binary: CONTROLROD_CODEXBAR (an absolute path; "off" disables), then PATH,
// then the fixed install paths. A set but unusable CONTROLROD_CODEXBAR means not found; it does
// not fall through to a different binary than the one the person named.
func (e *codexbarEngine) locate() (path string, found, disabled bool) {
	if v := strings.TrimSpace(e.getenv(codexbarEnv)); v != "" {
		if strings.EqualFold(v, "off") {
			return "", false, true
		}
		if filepath.IsAbs(v) && isExecutableFile(v) {
			return v, true, false
		}
		return "", false, false
	}
	if p, err := e.lookPath("codexbar"); err == nil && filepath.IsAbs(p) && isExecutableFile(p) {
		return p, true, false
	}
	for _, p := range e.fixed {
		if isExecutableFile(p) {
			return p, true, false
		}
	}
	return "", false, false
}

// codexbarListLimit bounds the provider-listing call and its output.
const (
	codexbarListTimeout = 15 * time.Second
	codexbarListMax     = 1 << 20
)

// codexbarNeverFetch lists ids CodexBar is never asked about. Control Rod reads Claude Code and
// Codex token-free, and a CodexBar fetch of either could launch that CLI and trigger its own
// Keychain prompt.
var codexbarNeverFetch = map[string]bool{"claude": true, "codex": true}

// listCodexbarEnabled returns the raw CodexBar ids to fetch: enabled in its config, mapped to one
// of ours, and not in codexbarNeverFetch. It runs `config providers --format json`, which
// (docs/cli.md "config providers lists providers and their configured enablement without
// fetching usage"; CLIConfigCommand.runConfigProviders) reads no credentials, starts no login and
// contacts no provider. Output is a top-level array of {provider, displayName, enabled,
// defaultEnabled, authentication, setup}; only provider and enabled are decoded here.
func listCodexbarEnabled(path string) ([]string, error) {
	out, err := runCodexbar(path, codexbarListTimeout, codexbarListMax, "config", "providers", "--format", "json")
	if err != nil {
		return nil, err
	}
	var rows []struct {
		Provider string `json:"provider"`
		Enabled  bool   `json:"enabled"`
	}
	if err := json.Unmarshal(bytes.TrimSpace(out), &rows); err != nil {
		return nil, err
	}
	var ids []string
	seen := map[string]bool{}
	for _, r := range rows {
		if !r.Enabled || seen[r.Provider] || codexbarNeverFetch[r.Provider] {
			continue
		}
		if _, ok := codexbarIDs[r.Provider]; !ok {
			continue
		}
		seen[r.Provider] = true
		ids = append(ids, r.Provider)
	}
	return ids, nil
}

// refresh locates the binary and, when found, reads its version (once per path), lists the
// enabled providers and fetches each allowed one with its own `usage --provider <id>` call: the
// command takes one provider per call (the last --provider wins; no list form). Calls share one
// deadline of e.timeout. If listing fails, nothing is fetched and the cache is cleared; there is
// no unfiltered fallback. A provider whose fetch fails keeps its previous reading this round.
func (e *codexbarEngine) refresh() {
	path, found, disabled := e.locate()
	e.mu.Lock()
	e.located, e.disabled, e.found = true, disabled, found
	if !found || path != e.path {
		e.version = ""
	}
	if !found {
		e.providers, e.path = nil, ""
		e.mu.Unlock()
		return
	}
	e.path = path
	needVersion := e.version == ""
	e.mu.Unlock()

	if needVersion {
		if out, err := runCodexbar(path, codexbarVersionLimit, 4<<10, "--version"); err == nil {
			v := parseCodexbarVersion(out)
			e.mu.Lock()
			e.version = v
			e.mu.Unlock()
		}
	}
	ids, err := listCodexbarEnabled(path)
	if err != nil {
		e.mu.Lock()
		e.providers = nil
		e.mu.Unlock()
		return
	}
	e.mu.Lock()
	prev := map[string]UsageProvider{}
	for _, p := range e.providers {
		prev[p.ID] = p
	}
	e.mu.Unlock()

	deadline := time.Now().Add(e.timeout)
	var provs []UsageProvider
	for _, raw := range ids {
		ours := codexbarIDs[raw]
		var got *UsageProvider
		if left := time.Until(deadline); left > 0 {
			if out, err := runCodexbar(path, left, codexbarMaxOutput, "usage", "--provider", raw, "--format", "json"); err == nil {
				for _, p := range parseCodexbarUsage(out, e.now()) {
					// Only the asked-for provider is kept, and never claude or codex.
					if p.ID == ours && !codexbarNeverFetch[p.ID] {
						p := p
						got = &p
					}
				}
			}
		}
		switch {
		case got != nil:
			provs = append(provs, *got)
		case prevHas(prev, ours):
			provs = append(provs, prev[ours])
		}
	}
	e.mu.Lock()
	e.providers = provs
	e.mu.Unlock()
}

func prevHas(m map[string]UsageProvider, id string) bool {
	_, ok := m[id]
	return ok
}

func (e *codexbarEngine) loop(ctx context.Context) {
	t := time.NewTimer(e.initialDelay)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
		e.refresh()
		t.Reset(e.interval)
	}
}

// snapshot returns the engine status and a copy of the cached providers. The engine is nil when
// it is disabled or has not been looked for yet.
func (e *codexbarEngine) snapshot() (*UsageEngine, []UsageProvider) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if !e.located || e.disabled {
		return nil, nil
	}
	eng := &UsageEngine{ID: "codexbar", Found: e.found}
	if e.found && codexbarVersionRE.MatchString(e.version) {
		eng.Version = e.version
	}
	out := make([]UsageProvider, len(e.providers))
	for i, p := range e.providers {
		p.Windows = append([]UsageWindow(nil), p.Windows...)
		out[i] = p
	}
	return eng, out
}

// startEngine starts the background reader once. The binary is looked for at once (file checks
// only), so the report can say found or not found before the first run finishes.
func (u *usageSources) startEngine(ctx context.Context) {
	u.engineOnce.Do(func() {
		e := newCodexbarEngine()
		_, found, disabled := e.locate()
		if disabled {
			return
		}
		e.mu.Lock()
		e.located, e.found = true, found
		e.mu.Unlock()
		u.cb.Store(e)
		go e.loop(ctx)
	})
}

// ---- merge ----

// keepNewerBuiltIn lists the ids the daemon also reads without CodexBar. For these the reading
// with the later observed_at wins; every other id comes from CodexBar.
var keepNewerBuiltIn = map[string]bool{RuntimeClaude: true, RuntimeCodex: true}

func observedTime(s string) time.Time {
	t, _ := time.Parse(time.RFC3339, s)
	return t
}

// mergeCodexbar folds the engine's cached readings into the built-in providers. A provider with
// no reading keeps source "none". Providers CodexBar reports beyond the built-in list are
// appended in its order, up to the contract's limit.
func mergeCodexbar(built []UsageProvider, e *codexbarEngine) (*UsageEngine, []UsageProvider) {
	eng, cb := e.snapshot()
	if eng == nil {
		return nil, built
	}
	out := append([]UsageProvider(nil), built...)
	idx := map[string]int{}
	for i, p := range out {
		idx[p.ID] = i
	}
	for _, p := range cb {
		if len(p.Windows) > usageMaxWindows {
			p.Windows = p.Windows[:usageMaxWindows]
		}
		i, have := idx[p.ID]
		switch {
		case !have:
			if len(out) >= usageMaxProviders {
				continue
			}
			idx[p.ID] = len(out)
			out = append(out, p)
		case out[i].Source == usageSourceNone:
			out[i] = p
		case keepNewerBuiltIn[p.ID]:
			if observedTime(p.ObservedAt).After(observedTime(out[i].ObservedAt)) {
				out[i] = p
			}
		default:
			out[i] = p
		}
	}
	return eng, out
}
