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

// cbFixture is synthetic, shaped after CodexBar's ProviderPayload (see usage_codexbar.go).
// Every identity-like or error-like string is planted so a leak shows up in the report JSON.
const cbFixture = `[
 {"provider":"claude","account":"planted.person@example.com","version":"2.1.0","source":"oauth",
  "status":{"indicator":"none","description":"PLANTED-STATUS-TEXT","url":"https://status.example.invalid"},
  "usage":{"primary":{"usedPercent":42.5,"windowMinutes":300,"resetsAt":"2026-11-24T15:00:00Z","resetDescription":"PLANTED-RESET-DESC"},
           "secondary":{"usedPercent":10,"windowMinutes":10080,"resetsAt":"2026-11-30T00:00:00Z"},
           "tertiary":{"usedPercent":5,"windowMinutes":10080,"resetsAt":"2026-11-30T00:00:00Z"},
           "updatedAt":"2026-11-24T12:00:00Z",
           "accountEmail":"planted.person@example.com","accountOrganization":"PLANTED-ORG","loginMethod":"PLANTED-LOGIN",
           "identity":{"accountEmail":"planted.person@example.com","accountID":"acct_PLANTEDID"}},
  "rateWindowLabels":{"primary":"Session","secondary":"Weekly","tertiary":"Weekly (Opus)"},
  "credits":{"remaining":99.5},"openaiDashboard":{"signedInEmail":"planted.person@example.com"},
  "diagnostic":"PLANTED-DIAGNOSTIC sk-ant-oat01-PLANTEDTOKEN","error":null},
 {"provider":"antigravity","source":"local","usage":{"primary":{"usedPercent":12,"windowMinutes":1440},"updatedAt":"2026-11-24T12:01:00.250Z"},
  "rateWindowLabels":{"primary":"Daily <b>pro</b> é"}},
 {"provider":"opencodego","source":"local","usage":{"primary":{"usedPercent":150,"windowMinutes":43200,"resetsAt":"2026-12-01T00:00:00Z"}}},
 {"provider":"grok","source":"api","usage":{"primary":{"usedPercent":1,"windowMinutes":777}}},
 {"provider":"xai","source":"api","usage":{"primary":{"usedPercent":1}}},
 {"provider":"cursor","source":"web","usage":null,"error":{"code":1,"message":"PLANTED-ERROR-TEXT planted.person@example.com","kind":"provider"}},
 {"provider":"gemini","source":"oauth","usage":{"primary":{"usedPercent":3},"updatedAt":"2026-11-24T11:00:00Z"},
  "error":{"code":2,"message":"PLANTED-ERROR-TEXT-2"}},
 {"provider":"copilot","source":"api","usage":{"primary":{"usedPercent":0,"windowMinutes":10080,"isSyntheticPlaceholder":true}}},
 {"provider":"openrouter","source":"api","usage":{"primary":{"usedPercent":9}}}
]`

var cbFetched = time.Date(2026, 11, 24, 12, 5, 0, 0, time.UTC)

func cbByID(ps []UsageProvider) map[string]UsageProvider {
	m := map[string]UsageProvider{}
	for _, p := range ps {
		m[p.ID] = p
	}
	return m
}

func TestCodexbarParse(t *testing.T) {
	got := parseCodexbarUsage([]byte(cbFixture), cbFetched)
	by := cbByID(got)
	for _, id := range []string{"claude", "agy", "opencode-go", "grok"} {
		if _, ok := by[id]; !ok {
			t.Fatalf("missing %s in %+v", id, got)
		}
	}
	// Error entries, placeholders, ids that are not mapped (xai, openrouter) and the unmapped
	// antigravity name produce nothing.
	for _, id := range []string{"cursor", "gemini", "copilot", "xai", "openrouter", "antigravity", "opencodego"} {
		if _, ok := by[id]; ok {
			t.Fatalf("%s must not be reported", id)
		}
	}
	if len(got) != 4 {
		t.Fatalf("providers %d: %+v", len(got), got)
	}
	c := by["claude"]
	if c.Source != "codexbar" || c.ObservedAt != "2026-11-24T12:00:00Z" || len(c.Windows) != 3 {
		t.Fatalf("claude %+v", c)
	}
	w := c.Windows[0]
	if w.ID != "five_hour" || w.WindowMinutes != 300 || w.UsedPercent != 42.5 || w.ResetsAt != "2026-11-24T15:00:00Z" {
		t.Fatalf("window %+v", w)
	}
	// Two windows of 10080 minutes: the first is seven_day, the second keeps its slot name.
	if c.Windows[1].ID != "seven_day" || c.Windows[2].ID != "tertiary" {
		t.Fatalf("windows %+v", c.Windows)
	}
	a := by["agy"]
	if a.Windows[0].ID != "daily" || a.ObservedAt != "2026-11-24T12:01:00Z" {
		t.Fatalf("agy %+v", a)
	}
	if o := by["opencode-go"]; o.Windows[0].ID != "monthly" || o.Windows[0].UsedPercent != 100 || o.ObservedAt != "2026-11-24T12:05:00Z" {
		t.Fatalf("opencode-go %+v", o)
	}
	if g := by["grok"]; g.Windows[0].ID != "primary" || g.Windows[0].WindowMinutes != 777 {
		t.Fatalf("grok %+v", g)
	}
}

func TestCodexbarIDMap(t *testing.T) {
	want := map[string]string{
		"claude": "claude", "codex": "codex", "gemini": "gemini", "antigravity": "agy", "cursor": "cursor",
		"copilot": "copilot", "opencode": "opencode", "opencodego": "opencode-go", "grok": "grok", "amp": "amp",
		"kiro": "kiro", "factory": "factory", "windsurf": "windsurf", "kilo": "kilo", "warp": "warp",
		"mistral": "mistral", "zed": "zed", "devin": "devin",
	}
	if len(codexbarIDs) != len(want) {
		t.Fatalf("map has %d ids", len(codexbarIDs))
	}
	for cb, ours := range want {
		if codexbarIDs[cb] != ours || !usageProviderIDs[ours] {
			t.Fatalf("%s -> %q", cb, codexbarIDs[cb])
		}
		raw := `[{"provider":"` + cb + `","usage":{"primary":{"usedPercent":1}}}]`
		if p := parseCodexbarUsage([]byte(raw), cbFetched); len(p) != 1 || p[0].ID != ours {
			t.Fatalf("%s parsed %+v", cb, p)
		}
	}
	for _, other := range []string{"xai", "openai", "openrouter", "zai", "", "agy", "opencode-go"} {
		raw := `[{"provider":"` + other + `","usage":{"primary":{"usedPercent":1}}}]`
		if p := parseCodexbarUsage([]byte(raw), cbFetched); len(p) != 0 {
			t.Fatalf("%q reported: %+v", other, p)
		}
	}
}

func TestCodexbarWindowIDs(t *testing.T) {
	tests := []struct {
		minutes int
		slot    string
		want    string
	}{
		{300, "secondary", "five_hour"}, {10080, "primary", "seven_day"}, {1440, "primary", "daily"},
		{40000, "primary", "monthly"}, {45000, "primary", "monthly"}, {43200, "tertiary", "monthly"},
		{39999, "primary", "primary"}, {45001, "secondary", "secondary"}, {0, "tertiary", "tertiary"}, {60, "primary", "primary"},
	}
	for _, tc := range tests {
		if got := cbWindowID(tc.minutes, tc.slot); got != tc.want {
			t.Fatalf("%d/%s = %s, want %s", tc.minutes, tc.slot, got, tc.want)
		}
	}
	// A window length outside the contract's range is dropped, the window is kept.
	p := parseCodexbarUsage([]byte(`[{"provider":"zed","usage":{"primary":{"usedPercent":5,"windowMinutes":99999}}}]`), cbFetched)
	if len(p) != 1 || p[0].Windows[0].WindowMinutes != 0 || p[0].Windows[0].ID != "primary" {
		t.Fatalf("%+v", p)
	}
}

// B1: upstream label text never reaches the report, even when the engine prints one.
func TestCodexbarDropsLabels(t *testing.T) {
	b, _ := json.Marshal(parseCodexbarUsage([]byte(cbFixture), cbFetched))
	for _, bad := range []string{"label", "Session", "Weekly", "Opus", "<b>"} {
		if strings.Contains(string(b), bad) {
			t.Fatalf("%q in %s", bad, b)
		}
	}
}

func TestCodexbarParseJunk(t *testing.T) {
	for _, in := range []string{"", "null", "not json", `[1,2,"x"]`, `{"provider":"claude"}`, `[{"provider":"claude","usage":{"primary":{"usedPercent":"high"}}}]`, "[" + strings.Repeat(" ", 10)} {
		if p := parseCodexbarUsage([]byte(in), cbFetched); len(p) != 0 {
			t.Fatalf("%q -> %+v", in, p)
		}
	}
	// A single object is accepted, and a bad entry does not hide the good ones.
	p := parseCodexbarUsage([]byte(`[{"provider":"claude","usage":{"primary":{"usedPercent":"x"}}},{"provider":"warp","usage":{"primary":{"usedPercent":7}}}]`), cbFetched)
	if len(p) != 1 || p[0].ID != "warp" {
		t.Fatalf("%+v", p)
	}
	p = parseCodexbarUsage([]byte(`{"provider":"kilo","usage":{"primary":{"usedPercent":7}}}`), cbFetched)
	if len(p) != 1 || p[0].ID != "kilo" {
		t.Fatalf("%+v", p)
	}
}

func TestParseCodexbarVersion(t *testing.T) {
	for in, want := range map[string]string{
		"CodexBar 0.85.1\n": "0.85.1", "CodexBar 1.0.0": "1.0.0", "CodexBar 1.0.0-beta+7": "", "CodexBar\n": "",
		"Other 1.0.0": "", "CodexBar 1.0": "", "CodexBar bad/ver": "", "CodexBar 1.0.0 extra": "",
		"CodexBar 1.0.0\nPLANTED-TEXT": "", "x CodexBar 1.0.0": "", "CodexBar 1.0.0\x00": "", "": "",
		"CodexBar " + strings.Repeat("1", 40) + ".0.0": "",
	} {
		if got := parseCodexbarVersion([]byte(in)); got != want {
			t.Fatalf("%q -> %q, want %q", in, got, want)
		}
	}
}

// B3: a --version that exits non-zero gives no version even if its output looks right.
func TestCodexbarVersionNeedsZeroExit(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "codexbar")
	script := "#!/bin/sh\ncase \"$1\" in\n--version) echo 'CodexBar 9.9.9'; exit 1;;\nconfig) echo '[]';;\nesac\n"
	if err := os.WriteFile(bin, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.refresh()
	if eng, _ := e.snapshot(); eng == nil || !eng.Found || eng.Version != "" {
		t.Fatalf("%+v", eng)
	}
}

// M1: the child gets the allowlist only; a planted token variable does not pass.
func TestCodexbarChildEnvAllowlist(t *testing.T) {
	env := map[string]string{
		"HOME": "/h", "PATH": "/bin", "USER": "u", "LANG": "C", "XDG_CONFIG_HOME": "/x", "CODEXBAR_CONFIG": "/c",
		"FOO_TOKEN": "PLANTED", "ANTHROPIC_API_KEY": "PLANTED", "NO_COLOR": "0", "CODEXBAR_DISABLE_KEYCHAIN_ACCESS": "0",
	}
	got := codexbarChildEnv(func(k string) string { return env[k] })
	joined := strings.Join(got, "\n")
	for _, want := range []string{"HOME=/h", "PATH=/bin", "USER=u", "LANG=C", "XDG_CONFIG_HOME=/x", "CODEXBAR_CONFIG=/c", "NO_COLOR=1", "CODEXBAR_DISABLE_KEYCHAIN_ACCESS=1"} {
		if !strings.Contains(joined, want) {
			t.Fatalf("%q missing from %v", want, got)
		}
	}
	for _, bad := range []string{"PLANTED", "FOO_TOKEN", "ANTHROPIC", "NO_COLOR=0", "KEYCHAIN_ACCESS=0"} {
		if strings.Contains(joined, bad) {
			t.Fatalf("%q in %v", bad, got)
		}
	}
	// End to end: a real child does not see the planted variable.
	t.Setenv("FOO_TOKEN", "PLANTED")
	dir := t.TempDir()
	bin := filepath.Join(dir, "codexbar")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\nenv\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	out, err := runCodexbar(bin, 10*time.Second, 64<<10, "x")
	if err != nil || strings.Contains(string(out), "FOO_TOKEN") || !strings.Contains(string(out), "CODEXBAR_DISABLE_KEYCHAIN_ACCESS=1") {
		t.Fatalf("%v %q", err, out)
	}
}

// fakeCodexbar writes a shell script that prints the version, lists every provider in usageJSON
// (plus a disabled kilo and an unmapped xai) as enabled, and answers `usage --provider <id>`
// with that provider's entries. Every call's arguments are appended to <dir>/args.log. A call
// without the no-prompt environment, or for an id with no fixture, exits non-zero.
func fakeCodexbar(t *testing.T, usageJSON string) string {
	t.Helper()
	dir := t.TempDir()
	var entries []json.RawMessage
	if err := json.Unmarshal([]byte(usageJSON), &entries); err != nil {
		t.Fatal(err)
	}
	by := map[string][]json.RawMessage{}
	var order []string
	for _, raw := range entries {
		var h struct {
			Provider string `json:"provider"`
		}
		_ = json.Unmarshal(raw, &h)
		if _, ok := by[h.Provider]; !ok {
			order = append(order, h.Provider)
		}
		by[h.Provider] = append(by[h.Provider], raw)
	}
	var rows []string
	for _, id := range order {
		b, _ := json.Marshal(by[id])
		if err := os.WriteFile(filepath.Join(dir, "usage-"+id+".json"), b, 0o600); err != nil {
			t.Fatal(err)
		}
		rows = append(rows, `{"provider":"`+id+`","displayName":"PLANTED-NAME","enabled":true,"defaultEnabled":false,"authentication":{"environmentVariables":["PLANTED_ENV"]}}`)
	}
	rows = append(rows, `{"provider":"kilo","displayName":"Kilo","enabled":false,"defaultEnabled":true}`)
	rows = append(rows, `{"provider":"claude","displayName":"Claude","enabled":true,"defaultEnabled":true}`)
	rows = append(rows, `{"provider":"codex","displayName":"Codex","enabled":true,"defaultEnabled":true}`)
	if err := os.WriteFile(filepath.Join(dir, "providers.json"), []byte("["+strings.Join(rows, ",")+"]"), 0o600); err != nil {
		t.Fatal(err)
	}
	script := "#!/bin/sh\nD='" + dir + "'\necho \"$*\" >> \"$D/args.log\"\n" +
		"if [ \"$CODEXBAR_DISABLE_KEYCHAIN_ACCESS\" != 1 ]; then exit 3; fi\n" +
		"case \"$1\" in\n--version) echo 'CodexBar 0.85.1';;\n" +
		"config) [ \"$2\" = providers ] && [ \"$3\" = --format ] && [ \"$4\" = json ] || exit 2; cat \"$D/providers.json\";;\n" +
		"usage) [ \"$2\" = --provider ] && [ \"$4\" = --format ] && [ \"$5\" = json ] || exit 2; cat \"$D/usage-$3.json\" || exit 4;;\n" +
		"*) exit 2;;\nesac\n"
	p := filepath.Join(dir, "codexbar")
	if err := os.WriteFile(p, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return p
}

// cbArgs returns the argument lines the fake binary was called with.
func cbArgs(t *testing.T, bin string) []string {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(filepath.Dir(bin), "args.log"))
	if err != nil {
		t.Fatal(err)
	}
	return strings.Split(strings.TrimSpace(string(b)), "\n")
}

func testEngine(env map[string]string) *codexbarEngine {
	e := newCodexbarEngine()
	e.getenv = func(k string) string { return env[k] }
	e.lookPath = func(string) (string, error) { return "", os.ErrNotExist }
	e.fixed = nil
	e.timeout = 5 * time.Second
	e.now = func() time.Time { return cbFetched }
	return e
}

func TestCodexbarEngineRunsBinary(t *testing.T) {
	bin := fakeCodexbar(t, cbFixture)
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.refresh()
	eng, provs := e.snapshot()
	if eng == nil || !eng.Found || eng.Version != "0.85.1" || eng.ID != "codexbar" {
		t.Fatalf("engine %+v", eng)
	}
	if len(provs) != 3 {
		t.Fatalf("providers %+v", provs)
	}
	// The no-prompt environment and arguments reached the child (the fake exits 3 otherwise).
	for _, p := range provs {
		if p.Source != "codexbar" || p.ID == "claude" || p.ID == "codex" {
			t.Fatalf("%+v", p)
		}
	}
	assertCBArgs(t, bin, []string{"antigravity", "opencodego", "grok", "cursor", "gemini", "copilot"})
}

// assertCBArgs checks every call the engine made: --version, the listing, and one explicit
// `usage --provider <id> --format json` per allowed id. No call names claude, codex, an unmapped
// id (xai, openrouter), a disabled id (kilo) or "all"/"both"; no call is a bare `usage`.
func assertCBArgs(t *testing.T, bin string, wantIDs []string) {
	t.Helper()
	lines := cbArgs(t, bin)
	var usage []string
	for _, l := range lines {
		for _, bad := range []string{"claude", "codex", "xai", "openrouter", "kilo", "all", "both", ","} {
			for _, f := range strings.Fields(l) {
				if f == bad || (bad == "," && strings.Contains(f, ",")) {
					t.Fatalf("argument %q in call %q", bad, l)
				}
			}
		}
		f := strings.Fields(l)
		switch f[0] {
		case "--version":
		case "config":
			if l != "config providers --format json" {
				t.Fatalf("listing call %q", l)
			}
		case "usage":
			if len(f) != 5 || f[1] != "--provider" || f[3] != "--format" || f[4] != "json" {
				t.Fatalf("usage call %q", l)
			}
			usage = append(usage, f[2])
		default:
			t.Fatalf("unexpected call %q", l)
		}
	}
	if strings.Join(usage, ",") != strings.Join(wantIDs, ",") {
		t.Fatalf("usage calls %v, want %v", usage, wantIDs)
	}
}

func TestCodexbarNeverFetchesClaudeOrCodex(t *testing.T) {
	// Only claude and codex enabled: no usage call at all.
	bin := fakeCodexbar(t, `[{"provider":"claude","usage":{"primary":{"usedPercent":1}}},{"provider":"codex","usage":{"primary":{"usedPercent":1}}}]`)
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.refresh()
	if _, p := e.snapshot(); len(p) != 0 {
		t.Fatalf("%+v", p)
	}
	assertCBArgs(t, bin, nil)

	// A binary that answers an allowed id with claude/codex entries too: they are dropped.
	dir := t.TempDir()
	bin2 := filepath.Join(dir, "codexbar")
	script := "#!/bin/sh\ncase \"$1\" in\n--version) echo 'CodexBar 1.0.0';;\n" +
		"config) echo '[{\"provider\":\"cursor\",\"enabled\":true}]';;\n" +
		"usage) echo '[{\"provider\":\"claude\",\"usage\":{\"primary\":{\"usedPercent\":5}}},{\"provider\":\"codex\",\"usage\":{\"primary\":{\"usedPercent\":5}}},{\"provider\":\"warp\",\"usage\":{\"primary\":{\"usedPercent\":5}}},{\"provider\":\"cursor\",\"usage\":{\"primary\":{\"usedPercent\":6}}}]';;\nesac\n"
	if err := os.WriteFile(bin2, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	e2 := testEngine(map[string]string{codexbarEnv: bin2})
	e2.refresh()
	_, p := e2.snapshot()
	if len(p) != 1 || p[0].ID != "cursor" || p[0].Windows[0].UsedPercent != 6 {
		t.Fatalf("%+v", p)
	}
}

func TestCodexbarListingFailureFetchesNothing(t *testing.T) {
	for name, listing := range map[string]string{
		"exit nonzero": "exit 5",
		"not json":     "echo 'not json'",
		"object":       "echo '{\"provider\":\"cursor\",\"enabled\":true}'",
	} {
		dir := t.TempDir()
		bin := filepath.Join(dir, "codexbar")
		script := "#!/bin/sh\necho \"$*\" >> '" + dir + "/args.log'\ncase \"$1\" in\n--version) echo 'CodexBar 1.0.0';;\nconfig) " + listing + ";;\nusage) echo '[{\"provider\":\"cursor\",\"usage\":{\"primary\":{\"usedPercent\":6}}}]';;\nesac\n"
		if err := os.WriteFile(bin, []byte(script), 0o700); err != nil {
			t.Fatal(err)
		}
		e := testEngine(map[string]string{codexbarEnv: bin})
		// A reading from an earlier round is dropped when listing fails.
		e.providers = []UsageProvider{{ID: "cursor", Source: "codexbar", Windows: []UsageWindow{{ID: "primary"}}}}
		e.refresh()
		eng, p := e.snapshot()
		if len(p) != 0 || eng == nil || !eng.Found {
			t.Fatalf("%s: %+v %+v", name, eng, p)
		}
		for _, l := range cbArgs(t, bin) {
			if strings.HasPrefix(l, "usage") {
				t.Fatalf("%s: usage called after listing failed: %q", name, l)
			}
		}
	}
}

func TestCodexbarLocate(t *testing.T) {
	bin := fakeCodexbar(t, "[]")
	dir := filepath.Dir(bin)
	notExec := filepath.Join(dir, "usage.json")
	e := testEngine(nil)
	if _, found, off := e.locate(); found || off {
		t.Fatal("nothing configured must be not found")
	}
	e.lookPath = func(n string) (string, error) {
		if n != "codexbar" {
			t.Fatalf("looked up %q", n)
		}
		return bin, nil
	}
	if p, found, _ := e.locate(); !found || p != bin {
		t.Fatal("PATH lookup")
	}
	e.lookPath = func(string) (string, error) { return "relative/codexbar", nil }
	e.fixed = []string{filepath.Join(dir, "missing"), bin}
	if p, found, _ := e.locate(); !found || p != bin {
		t.Fatal("fixed paths after PATH")
	}
	// The env var wins over PATH, must be absolute, and does not fall through when unusable.
	e.lookPath = func(string) (string, error) { return bin, nil }
	for _, v := range []string{"codexbar", "./codexbar", notExec, filepath.Join(dir, "missing")} {
		e.getenv = func(string) string { return v }
		if _, found, off := e.locate(); found || off {
			t.Fatalf("env %q found=%v", v, found)
		}
	}
	for _, v := range []string{"off", "OFF", " off "} {
		e.getenv = func(string) string { return v }
		if _, found, off := e.locate(); found || !off {
			t.Fatalf("env %q must disable", v)
		}
	}
}

func TestCodexbarOffAndMissing(t *testing.T) {
	ctl := t.TempDir()
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	home := t.TempDir()
	noEnv := func(string) string { return "" }

	// off: no engine in the report, no process, and the engine never starts.
	t.Setenv(codexbarEnv, "off")
	u := newUsageSources(ctl)
	u.startEngine(context.Background())
	time.Sleep(100 * time.Millisecond) // the first look runs in the background
	if u.cb.Load() != nil {
		t.Fatal("off must not start the engine")
	}
	if rep := u.Report(now, home, noEnv); rep.Engine != nil {
		t.Fatalf("engine %+v", rep.Engine)
	}

	// missing: found=false, built-in providers still listed with source none.
	e := testEngine(nil)
	e.refresh()
	u2 := newUsageSources(ctl)
	u2.cb.Store(e)
	rep := u2.Report(now, home, noEnv)
	if rep.Engine == nil || rep.Engine.Found || rep.Engine.Version != "" || rep.Engine.ID != "codexbar" {
		t.Fatalf("engine %+v", rep.Engine)
	}
	if len(rep.Providers) == 0 {
		t.Fatal("no providers")
	}
	for _, p := range rep.Providers {
		if p.Source != "none" || len(p.Windows) != 0 {
			t.Fatalf("%+v", p)
		}
	}
	b, _ := json.Marshal(rep)
	if !strings.Contains(string(b), `"engine":{"id":"codexbar","found":false}`) {
		t.Fatalf("%s", b)
	}
}

func TestCodexbarStartEngineFindsBinary(t *testing.T) {
	bin := fakeCodexbar(t, cbFixture)
	t.Setenv(codexbarEnv, bin)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	u := newUsageSources(t.TempDir())
	u.startEngine(ctx)
	u.startEngine(ctx) // once
	var rep *UsageLimitsReport
	for end := time.Now().Add(5 * time.Second); time.Now().Before(end); time.Sleep(10 * time.Millisecond) {
		if rep = u.Report(time.Now(), t.TempDir(), func(string) string { return "" }); rep.Engine != nil {
			break
		}
	}
	if rep.Engine == nil || !rep.Engine.Found {
		t.Fatalf("engine %+v", rep.Engine)
	}
}

func TestCodexbarSlowBinaryKilled(t *testing.T) {
	dir := t.TempDir()
	pidFile := filepath.Join(dir, "child.pid")
	script := "#!/bin/sh\nsleep 60 &\necho $! > '" + pidFile + "'\nwait\n"
	bin := filepath.Join(dir, "codexbar")
	if err := os.WriteFile(bin, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	start := time.Now()
	out, err := runCodexbar(bin, 400*time.Millisecond, 1<<10, "usage", "--format", "json")
	if err != context.DeadlineExceeded || out != nil {
		t.Fatalf("err %v out %q", err, out)
	}
	if d := time.Since(start); d > 10*time.Second {
		t.Fatalf("took %s", d)
	}
	b, err := os.ReadFile(pidFile)
	if err != nil {
		t.Fatal(err)
	}
	var pid int
	if _, err := fmt.Sscan(strings.TrimSpace(string(b)), &pid); err != nil || pid <= 0 {
		t.Fatalf("pid %q", b)
	}
	// The grandchild sleep is in the killed process group: it is gone, or a zombie that init reaps.
	deadline := time.Now().Add(3 * time.Second)
	for {
		p, _ := os.FindProcess(pid)
		if p.Signal(syscall.Signal(0)) != nil {
			return
		}
		if st, err := os.ReadFile("/proc/" + strings.TrimSpace(string(b)) + "/stat"); err == nil && strings.Contains(string(st), ") Z ") {
			return
		}
		if time.Now().After(deadline) {
			t.Fatal("child of the slow binary still running")
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func TestCodexbarEngineTimeoutKeepsLastGood(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "codexbar")
	head := "#!/bin/sh\nif [ \"$1\" = --version ]; then echo 'CodexBar 1.2.3'; exit 0; fi\nif [ \"$1\" = config ]; then echo '[{\"provider\":\"warp\",\"enabled\":true}]'; exit 0; fi\n"
	good := head + "printf '%s' '[{\"provider\":\"warp\",\"usage\":{\"primary\":{\"usedPercent\":7}}}]'\n"
	slow := head + "exec sleep 30\n"
	if err := os.WriteFile(bin, []byte(good), 0o700); err != nil {
		t.Fatal(err)
	}
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.timeout = 400 * time.Millisecond
	e.refresh()
	if _, p := e.snapshot(); len(p) != 1 {
		t.Fatalf("%+v", p)
	}
	if err := os.WriteFile(bin, []byte(slow), 0o700); err != nil {
		t.Fatal(err)
	}
	e.refresh()
	if eng, p := e.snapshot(); len(p) != 1 || eng.Version != "1.2.3" {
		t.Fatalf("last good lost: %+v %+v", eng, p)
	}
}

func TestCodexbarOutputCap(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "codexbar")
	if err := os.WriteFile(bin, []byte("#!/bin/sh\nyes xxxxxxxxxxxxxxxx\n"), 0o700); err != nil {
		t.Fatal(err)
	}
	out, err := runCodexbar(bin, 10*time.Second, 4<<10, "usage")
	if err == nil || out != nil {
		t.Fatalf("over-cap output accepted: %v %d", err, len(out))
	}
}

func TestCodexbarNoIdentityInReport(t *testing.T) {
	bin := fakeCodexbar(t, cbFixture)
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.refresh()
	u := newUsageSources(t.TempDir())
	u.cb.Store(e)
	rep := u.Report(time.Date(2026, 11, 24, 12, 6, 0, 0, time.UTC), t.TempDir(), func(string) string { return "" })
	b, err := json.Marshal(rep)
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"PLANTED", "planted", "example.com", "sk-ant", "TOKEN", "acct_", "@", "credits", "diagnostic", "error", "account", "email", "status.example"} {
		if strings.Contains(string(b), bad) {
			t.Fatalf("%q in report: %s", bad, b)
		}
	}
	if len(rep.Providers) > usageMaxProviders {
		t.Fatal("too many providers")
	}
	for _, p := range rep.Providers {
		if !usageProviderIDs[p.ID] || len(p.Windows) > usageMaxWindows {
			t.Fatalf("%+v", p)
		}
		if p.Source == "none" && len(p.Windows) != 0 {
			t.Fatalf("%+v", p)
		}
	}
}

const cbMergeFixture = `[
	 {"provider":"claude","usage":{"primary":{"usedPercent":99,"windowMinutes":300,"resetsAt":"2026-11-24T15:00:00Z"},"updatedAt":"2026-11-24T11:00:00Z"}},
	 {"provider":"codex","usage":{"primary":{"usedPercent":77,"windowMinutes":300},"updatedAt":"2026-11-24T11:59:00Z"}},
	 {"provider":"grok","usage":{"primary":{"usedPercent":8},"updatedAt":"2026-11-24T11:59:00Z"}},
	 {"provider":"cursor","usage":{"primary":{"usedPercent":9},"updatedAt":"2026-11-24T11:59:00Z"}}]`

func TestCodexbarMerge(t *testing.T) {
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	ctl := t.TempDir()
	home := t.TempDir()
	root := filepath.Join(home, ".codex", "sessions")
	// Codex's own log says 11% at 02:00 (older than CodexBar's 12:00 reading).
	writeRollout(t, root, "2026/11/24", "rollout-2026-11-24T02-00-00-b.jsonl", rl("2026-11-24T02:00:00Z", "11.0", "plus"))
	// Claude's stream reading is observed now, newer than CodexBar's.
	u := newUsageSources(ctl)
	u.store.record(RuntimeClaude, UsageWindow{ID: "five_hour", WindowMinutes: 300, UsedPercent: 30, ResetsAt: "2026-11-24T15:00:00Z"}, now)
	bin := fakeCodexbar(t, `[{"provider":"grok","usage":{"primary":{"usedPercent":8},"updatedAt":"2026-11-24T11:59:00Z"}},
	 {"provider":"cursor","usage":{"primary":{"usedPercent":9},"updatedAt":"2026-11-24T11:59:00Z"}}]`)
	// The engine never fetches claude or codex itself, so the merge rule is exercised with
	// readings injected into its cache.
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.refresh()
	e.mu.Lock()
	e.providers = append(parseCodexbarUsage([]byte(cbMergeFixture), now), e.providers...)
	e.mu.Unlock()
	u.cb.Store(e)
	rep := u.Report(now, home, func(string) string { return "" })
	by := cbByID(rep.Providers)
	if c := by["claude"]; c.Source != "cli-stream" || c.Windows[0].UsedPercent != 30 {
		t.Fatalf("claude should keep the newer stream reading: %+v", c)
	}
	if c := by["codex"]; c.Source != "codexbar" || c.Windows[0].UsedPercent != 77 {
		t.Fatalf("codex should take the newer CodexBar reading: %+v", c)
	}
	if g := by["grok"]; g.Source != "codexbar" || g.Windows[0].UsedPercent != 8 {
		t.Fatalf("grok %+v", g)
	}
	if c := by["cursor"]; c.Source != "codexbar" {
		t.Fatalf("cursor %+v", c)
	}
	// A built-in adapter with no reading from either source keeps source none.
	none := []UsageProvider{{ID: "agy", Source: "none", Windows: []UsageWindow{}}, {ID: "opencode", Source: "none", Windows: []UsageWindow{}}}
	_, merged0 := mergeCodexbar(none, e)
	if p := cbByID(merged0)["agy"]; p.Source != "none" || len(p.Windows) != 0 {
		t.Fatalf("agy %+v", p)
	}
	if rep.Engine == nil || !rep.Engine.Found || rep.Engine.Version != "0.85.1" {
		t.Fatalf("engine %+v", rep.Engine)
	}
	// An equal observed_at keeps the built-in reading.
	built := []UsageProvider{{ID: "codex", Source: "cli-log", ObservedAt: "2026-11-24T11:59:00Z", Windows: []UsageWindow{{ID: "primary", UsedPercent: 1}}}}
	_, merged := mergeCodexbar(built, e)
	if cbByID(merged)["codex"].Source != "cli-log" {
		t.Fatalf("tie must keep the built-in: %+v", merged)
	}
}

func TestCodexbarMergeCaps(t *testing.T) {
	var sb strings.Builder
	sb.WriteString("[")
	ids := []string{"gemini", "cursor", "copilot", "opencode-go", "amp", "kiro", "factory", "windsurf", "kilo", "warp", "mistral", "zed", "devin"}
	for i, id := range ids {
		if i > 0 {
			sb.WriteString(",")
		}
		sb.WriteString(`{"provider":"` + strings.ReplaceAll(id, "opencode-go", "opencodego") + `","usage":{"primary":{"usedPercent":1}}}`)
	}
	sb.WriteString("]")
	e := testEngine(map[string]string{codexbarEnv: fakeCodexbar(t, sb.String())})
	e.refresh()
	built := make([]UsageProvider, 0, 20)
	for i := 0; i < 20; i++ {
		built = append(built, UsageProvider{ID: "x" + string(rune('a'+i)), Source: "none", Windows: []UsageWindow{}})
	}
	_, merged := mergeCodexbar(built, e)
	if len(merged) != usageMaxProviders {
		t.Fatalf("%d providers", len(merged))
	}
}

func pidGone(t *testing.T, pidFile string) {
	t.Helper()
	var pid int
	deadline := time.Now().Add(3 * time.Second)
	for pid <= 0 {
		b, _ := os.ReadFile(pidFile)
		fmt.Sscan(strings.TrimSpace(string(b)), &pid)
		if time.Now().After(deadline) {
			t.Fatal("no pid recorded")
		}
		time.Sleep(10 * time.Millisecond)
	}
	for {
		p, _ := os.FindProcess(pid)
		if p.Signal(syscall.Signal(0)) != nil {
			return
		}
		if st, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid)); err == nil && strings.Contains(string(st), ") Z ") {
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("process %d still running", pid)
		}
		time.Sleep(50 * time.Millisecond)
	}
}

// M6: the process group is killed after a successful run, after an overflow and on cancel.
func TestCodexbarKillsGroupAfterEveryRun(t *testing.T) {
	mk := func(body string) (string, string) {
		dir := t.TempDir()
		pid := filepath.Join(dir, "child.pid")
		bin := filepath.Join(dir, "codexbar")
		if err := os.WriteFile(bin, []byte("#!/bin/sh\nsleep 60 >/dev/null 2>&1 </dev/null &\necho $! > '"+pid+"'\n"+body), 0o700); err != nil {
			t.Fatal(err)
		}
		return bin, pid
	}
	bin, pid := mk("echo ok\n")
	if out, err := runCodexbar(bin, 10*time.Second, 1<<10); err != nil || strings.TrimSpace(string(out)) != "ok" {
		t.Fatalf("%v %q", err, out)
	}
	pidGone(t, pid)

	bin, pid = mk("yes xxxxxxxxxxxxxxxx\n")
	start := time.Now()
	if out, err := runCodexbar(bin, 30*time.Second, 1<<10); err == nil || out != nil {
		t.Fatalf("%v %q", err, out)
	}
	if time.Since(start) > 10*time.Second {
		t.Fatal("overflow did not stop the run")
	}
	pidGone(t, pid)

	bin, pid = mk("sleep 60\n")
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(300 * time.Millisecond); cancel() }()
	start = time.Now()
	if _, err := runCodexbarCtx(ctx, bin, 30*time.Second, 1<<10); err != context.Canceled {
		t.Fatalf("%v", err)
	}
	if time.Since(start) > 10*time.Second {
		t.Fatal("cancel did not stop the run")
	}
	pidGone(t, pid)
}

// M7: one deadline covers the whole refresh, and a provider that hangs does not starve the same
// later providers: the start of the order rotates.
func TestCodexbarRotatesAfterHungProvider(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "codexbar")
	script := "#!/bin/sh\ncase \"$1\" in\n--version) echo 'CodexBar 1.2.3';;\n" +
		"config) echo '[{\"provider\":\"cursor\",\"enabled\":true},{\"provider\":\"warp\",\"enabled\":true}]';;\n" +
		"usage) if [ \"$3\" = cursor ]; then exec sleep 30; fi; echo '[{\"provider\":\"warp\",\"usage\":{\"primary\":{\"usedPercent\":7}}}]';;\nesac\n"
	if err := os.WriteFile(bin, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.timeout = 2 * time.Second
	e.probeTimeout = 2 * time.Second // the hung call uses the whole deadline
	start := time.Now()
	e.refresh()
	if d := time.Since(start); d > 6*time.Second {
		t.Fatalf("refresh took %s, over the one deadline", d)
	}
	if _, p := e.snapshot(); len(p) != 0 {
		t.Fatalf("starved provider read in round 1: %+v", p)
	}
	e.refresh() // starts at warp now
	if _, p := e.snapshot(); len(p) != 1 || p[0].ID != "warp" {
		t.Fatalf("round 2: %+v", p)
	}
}

// M7: a single probe is bounded by its own limit, not by what is left of the whole deadline.
func TestCodexbarProbeHasOwnDeadline(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "codexbar")
	script := "#!/bin/sh\ncase \"$1\" in\n--version) echo 'CodexBar 1.2.3';;\n" +
		"config) echo '[{\"provider\":\"cursor\",\"enabled\":true},{\"provider\":\"warp\",\"enabled\":true}]';;\n" +
		"usage) if [ \"$3\" = cursor ]; then exec sleep 30; fi; echo '[{\"provider\":\"warp\",\"usage\":{\"primary\":{\"usedPercent\":7}}}]';;\nesac\n"
	if err := os.WriteFile(bin, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.timeout = 20 * time.Second
	e.probeTimeout = 300 * time.Millisecond
	start := time.Now()
	e.refresh()
	if d := time.Since(start); d > 5*time.Second {
		t.Fatalf("hung probe held the refresh for %s", d)
	}
	if _, p := e.snapshot(); len(p) != 1 || p[0].ID != "warp" {
		t.Fatalf("%+v", p)
	}
}

// R3: a cancelled context launches nothing, and a cancel during a run ends the refresh at once and
// kills the child's process group.
func TestCodexbarRefreshHonoursContext(t *testing.T) {
	dir := t.TempDir()
	marker := filepath.Join(dir, "launched")
	bin := filepath.Join(dir, "codexbar")
	script := "#!/bin/sh\necho x >> " + marker + "\nsleep 30 &\nsleep 30\n"
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	e := testEngine(map[string]string{codexbarEnv: bin})
	e.refreshCtx(ctx)
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("launched under a cancelled context")
	}

	ctx2, cancel2 := context.WithCancel(context.Background())
	defer cancel2()
	e2 := testEngine(map[string]string{codexbarEnv: bin})
	e2.timeout = time.Minute
	done := make(chan struct{})
	go func() { e2.refreshCtx(ctx2); close(done) }()
	for end := time.Now().Add(5 * time.Second); time.Now().Before(end); time.Sleep(10 * time.Millisecond) {
		if _, err := os.Stat(marker); err == nil {
			break
		}
	}
	cancel2()
	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("refresh outlived the cancelled context")
	}
}

// R5: every CodexBar window carries the snapshot's time.
func TestCodexbarWindowsCarryObservedAt(t *testing.T) {
	provs := parseCodexbarUsage([]byte(cbFixture), cbFetched)
	if len(provs) == 0 {
		t.Fatal("no providers")
	}
	for _, p := range provs {
		for _, w := range p.Windows {
			if w.ObservedAt == "" || w.ObservedAt != p.ObservedAt {
				t.Fatalf("%s %+v provider %s", p.ID, w, p.ObservedAt)
			}
		}
	}
}

// modalCodexbar answers warp's usage call from <dir>/mode: "good" gives a reading, "bad" exits 0
// with JSON that holds no valid window (a schema change), "fail" exits non-zero.
func modalCodexbar(t *testing.T) (bin, mode string) {
	t.Helper()
	dir := t.TempDir()
	bin, mode = filepath.Join(dir, "codexbar"), filepath.Join(dir, "mode")
	script := "#!/bin/sh\ncase \"$1\" in\n--version) echo 'CodexBar 1.2.3';;\n" +
		"config) echo '[{\"provider\":\"warp\",\"enabled\":true}]';;\n" +
		"usage) case \"$(cat '" + mode + "')\" in\n" +
		"good) echo '[{\"provider\":\"warp\",\"usage\":{\"primary\":{\"usedPercent\":7}}}]';;\n" +
		"future) echo '[{\"provider\":\"warp\",\"usage\":{\"primary\":{\"usedPercent\":7},\"updatedAt\":\"2099-01-01T00:00:00Z\"}}]';;\n" +
		"bad) echo '[{\"provider\":\"warp\",\"usage\":{\"newShape\":{\"pct\":7}}}]';;\n" +
		"*) exit 5;;\nesac;;\nesac\n"
	if err := os.WriteFile(bin, []byte(script), 0o700); err != nil {
		t.Fatal(err)
	}
	return bin, mode
}

func TestCodexbarFailedFetchKeepsReadingOnlyWhileRecent(t *testing.T) {
	bin, mode := modalCodexbar(t)
	set := func(m string) {
		if err := os.WriteFile(mode, []byte(m), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	e := testEngine(map[string]string{codexbarEnv: bin})
	now := cbFetched
	e.now = func() time.Time { return now }
	set("good")
	e.refresh()
	if _, p := e.snapshot(); len(p) != 1 {
		t.Fatalf("%+v", p)
	}
	set("fail")
	now = cbFetched.Add(29 * time.Minute)
	e.refresh()
	if _, p := e.snapshot(); len(p) != 1 {
		t.Fatalf("reading under 30 minutes old dropped: %+v", p)
	}
	now = cbFetched.Add(31 * time.Minute)
	e.refresh()
	if _, p := e.snapshot(); len(p) != 0 {
		t.Fatalf("stale reading kept: %+v", p)
	}
}

func TestCodexbarCompletedFetchWithNoWindowsClearsProvider(t *testing.T) {
	bin, mode := modalCodexbar(t)
	e := testEngine(map[string]string{codexbarEnv: bin})
	if err := os.WriteFile(mode, []byte("good"), 0o600); err != nil {
		t.Fatal(err)
	}
	e.refresh()
	if _, p := e.snapshot(); len(p) != 1 {
		t.Fatalf("%+v", p)
	}
	if err := os.WriteFile(mode, []byte("bad"), 0o600); err != nil {
		t.Fatal(err)
	}
	e.refresh() // same instant: age is no reason to drop it, the schema is
	if _, p := e.snapshot(); len(p) != 0 {
		t.Fatalf("reading kept after a completed fetch with no valid window: %+v", p)
	}
}

func TestCodexbarFutureUpdatedAtDoesNotExtendRetention(t *testing.T) {
	bin, mode := modalCodexbar(t)
	set := func(m string) {
		if err := os.WriteFile(mode, []byte(m), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	e := testEngine(map[string]string{codexbarEnv: bin})
	now := cbFetched
	e.now = func() time.Time { return now }
	set("future")
	e.refresh()
	_, p := e.snapshot()
	if len(p) != 1 {
		t.Fatalf("%+v", p)
	}
	if p[0].ObservedAt != cbFetched.Format(time.RFC3339) {
		t.Fatalf("future observed_at not clamped to the local fetch: %q", p[0].ObservedAt)
	}
	for _, w := range p[0].Windows {
		if w.ObservedAt != p[0].ObservedAt {
			t.Fatalf("window observed_at %q", w.ObservedAt)
		}
	}
	set("fail")
	now = cbFetched.Add(29 * time.Minute)
	e.refresh()
	if _, p := e.snapshot(); len(p) != 1 {
		t.Fatalf("reading dropped early: %+v", p)
	}
	now = cbFetched.Add(31 * time.Minute)
	e.refresh()
	if _, p := e.snapshot(); len(p) != 0 {
		t.Fatalf("future updatedAt extended retention: %+v", p)
	}
}

func TestCodexbarExpiredEntryLeavesSnapshotWithoutRefresh(t *testing.T) {
	bin, mode := modalCodexbar(t)
	if err := os.WriteFile(mode, []byte("good"), 0o600); err != nil {
		t.Fatal(err)
	}
	e := testEngine(map[string]string{codexbarEnv: bin})
	now := cbFetched
	e.now = func() time.Time { return now }
	e.refresh()
	now = cbFetched.Add(29 * time.Minute)
	if _, p := e.snapshot(); len(p) != 1 {
		t.Fatalf("%+v", p)
	}
	now = cbFetched.Add(31 * time.Minute) // no refresh in between
	if _, p := e.snapshot(); len(p) != 0 {
		t.Fatalf("expired entry still published: %+v", p)
	}
}

func TestCodexbarOldUpstreamTimeOnlyShortensExpiry(t *testing.T) {
	p := UsageProvider{ID: "warp", ObservedAt: cbFetched.Add(-20 * time.Minute).Format(time.RFC3339)}
	if got, want := cbExpiry(p, cbFetched), cbFetched.Add(10*time.Minute); !got.Equal(want) {
		t.Fatalf("%v want %v", got, want)
	}
	p.ObservedAt = cbFetched.Add(time.Hour).Format(time.RFC3339)
	if got, want := cbExpiry(p, cbFetched), cbFetched.Add(30*time.Minute); !got.Equal(want) {
		t.Fatalf("%v want %v", got, want)
	}
}
