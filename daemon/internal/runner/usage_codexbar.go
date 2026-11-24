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
	"unicode/utf8"
)

// CodexBar as the usage engine for harnesses that have no token-free source (owner decision
// 2026-11-24). CodexBar (MIT, github.com/steipete/CodexBar) is installed and signed in by the
// person; it does its own sign-in work. Control Rod runs its `codexbar usage --format json`
// command and keeps only percentages, window lengths, reset times and the fetch
// time. Upstream window labels are dropped; the web derives labels from window ids. It never reads a token, and it drops every other field the command prints (account,
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
	codexbarProbeTimeout  = 20 * time.Second
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
	// Only `CodexBar <major>.<minor>.<patch>` from a zero-exit --version is accepted, and only the
	// captured digits are kept.
	codexbarVersionOutRE = regexp.MustCompile(`^CodexBar (\d+\.\d+\.\d+)$`)
	codexbarVersionRE    = regexp.MustCompile(`^\d{1,6}\.\d{1,6}\.\d{1,6}$`)
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
	Error json.RawMessage `json:"error"`
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
		name string
		w    *cbWindow
	}{{"primary", e.Usage.Primary}, {"secondary", e.Usage.Secondary}, {"tertiary", e.Usage.Tertiary}}
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
// over is closed on the first overflow so the runner can stop at once.
type capWriter struct {
	buf      bytes.Buffer
	max      int
	overflow bool
	over     chan struct{}
}

func (c *capWriter) Write(p []byte) (int, error) {
	if c.buf.Len()+len(p) > c.max {
		if !c.overflow {
			c.overflow = true
			close(c.over)
		}
		return 0, errors.New("output cap reached")
	}
	return c.buf.Write(p)
}

// codexbarEnvKeys are the only inherited variables the child gets. CodexBar needs HOME and the XDG
// directories to find its own configuration; no other variable (tokens, API keys, proxies) passes.
var codexbarEnvKeys = []string{
	"HOME", "PATH", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR",
	"XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "CODEXBAR_CONFIG",
}

// codexbarChildEnv builds the child's environment from the allowlist, then fixes the two
// variables Control Rod sets. A listed variable that is unset or empty is left out.
func codexbarChildEnv(getenv func(string) string) []string {
	var env []string
	for _, k := range codexbarEnvKeys {
		if v := getenv(k); v != "" {
			env = append(env, k+"="+v)
		}
	}
	return append(env, "NO_COLOR=1", "CODEXBAR_DISABLE_KEYCHAIN_ACCESS=1")
}

// runCodexbar runs path with args and returns stdout, capped.
func runCodexbar(path string, timeout time.Duration, limit int, args ...string) ([]byte, error) {
	return runCodexbarCtx(context.Background(), path, timeout, limit, args...)
}

// runCodexbarCtx runs path in its own process group with an allowlisted environment. Stdin is
// /dev/null and stderr is discarded. CODEXBAR_DISABLE_KEYCHAIN_ACCESS=1 blocks CodexBar's own
// Keychain operations on macOS. However the run ends (success, error, output over the cap,
// timeout, ctx cancelled) the process group is killed and the child is waited for, so nothing it
// started outlives the call.
func runCodexbarCtx(ctx context.Context, path string, timeout time.Duration, limit int, args ...string) ([]byte, error) {
	cmd := exec.Command(path, args...)
	cmd.Env = codexbarChildEnv(os.Getenv)
	setProcessGroup(cmd)
	cmd.WaitDelay = codexbarKillWaitDelay
	w := &capWriter{max: limit, over: make(chan struct{})}
	cmd.Stdout = w
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	var (
		err      error
		finished bool
	)
	select {
	case err = <-done:
		finished = true
	case <-w.over:
		err = errors.New("codexbar output over the cap")
	case <-timer.C:
		err = context.DeadlineExceeded
	case <-ctx.Done():
		err = ctx.Err()
	}
	// The group is killed after every run, so a helper the child started cannot outlive it. The
	// leader is this process's own child; an emptied group makes the signal a no-op.
	killProcessGroup(cmd)
	if !finished {
		<-done
	}
	if err == nil && w.overflow {
		err = errors.New("codexbar output over the cap")
	}
	if err != nil {
		return nil, err
	}
	return w.buf.Bytes(), nil
}

// parseCodexbarVersion accepts only `CodexBar <major>.<minor>.<patch>` and returns the digits.
func parseCodexbarVersion(out []byte) string {
	if !utf8.Valid(out) {
		return ""
	}
	if m := codexbarVersionOutRE.FindStringSubmatch(strings.TrimSpace(string(out))); m != nil && codexbarVersionRE.MatchString(m[1]) {
		return m[1]
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

	ctx          context.Context // ends a run in progress; nil means never
	timeout      time.Duration   // one deadline for a whole refresh
	probeTimeout time.Duration   // each usage call, also bounded by what is left of timeout
	interval     time.Duration
	initialDelay time.Duration
	now          func() time.Time

	rot       int // where the next refresh starts in the provider order
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
		timeout: codexbarRunTimeout, probeTimeout: codexbarProbeTimeout, interval: codexbarInterval, initialDelay: codexbarInitialDelay,
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

// listEnabled returns the raw CodexBar ids to fetch: enabled in its config, mapped to one
// of ours, and not in codexbarNeverFetch. It runs `config providers --format json`, which
// (docs/cli.md "config providers lists providers and their configured enablement without
// fetching usage"; CLIConfigCommand.runConfigProviders) reads no credentials, starts no login and
// contacts no provider. Output is a top-level array of {provider, displayName, enabled,
// defaultEnabled, authentication, setup}; only provider and enabled are decoded here.
func (e *codexbarEngine) listEnabled(deadline time.Time, path string) ([]string, error) {
	out, err := e.run(deadline, codexbarListTimeout, path, codexbarListMax, "config", "providers", "--format", "json")
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

// run is runCodexbarCtx under the refresh's deadline: the call gets at most limit, and never more
// than what is left. It fails at once when nothing is left.
func (e *codexbarEngine) run(deadline time.Time, limit time.Duration, path string, max int, args ...string) ([]byte, error) {
	left := time.Until(deadline)
	if left <= 0 {
		return nil, context.DeadlineExceeded
	}
	if left < limit {
		limit = left
	}
	ctx := e.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	return runCodexbarCtx(ctx, path, limit, max, args...)
}

// refresh locates the binary and, when found, reads its version (once per path), lists the
// enabled providers and fetches each allowed one with its own `usage --provider <id>` call: the
// command takes one provider per call (the last --provider wins; no list form). One deadline of
// e.timeout, counted from the start of the refresh, covers every call; each usage call also has
// its own shorter limit, and the start of the provider order rotates every refresh so a hung
// provider cannot starve the same later ones. If listing fails, nothing is fetched and the cache
// is cleared; there is no unfiltered fallback. A provider whose fetch fails keeps its previous
// reading this round.
func (e *codexbarEngine) refresh() {
	deadline := time.Now().Add(e.timeout)
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
		if out, err := e.run(deadline, codexbarVersionLimit, path, 4<<10, "--version"); err == nil {
			v := parseCodexbarVersion(out)
			e.mu.Lock()
			e.version = v
			e.mu.Unlock()
		}
	}
	ids, err := e.listEnabled(deadline, path)
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
	start := 0
	if len(ids) > 0 {
		start = e.rot % len(ids)
		e.rot = (start + 1) % len(ids)
	}
	e.mu.Unlock()

	got := map[string]*UsageProvider{}
	for i := range ids {
		raw := ids[(start+i)%len(ids)]
		ours := codexbarIDs[raw]
		out, err := e.run(deadline, e.probeTimeout, path, codexbarMaxOutput, "usage", "--provider", raw, "--format", "json")
		if err != nil {
			continue
		}
		for _, p := range parseCodexbarUsage(out, e.now()) {
			// Only the asked-for provider is kept, and never claude or codex.
			if p.ID == ours && !codexbarNeverFetch[p.ID] {
				p := p
				got[ours] = &p
			}
		}
	}
	var provs []UsageProvider
	for _, raw := range ids {
		ours := codexbarIDs[raw]
		switch {
		case got[ours] != nil:
			provs = append(provs, *got[ours])
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
