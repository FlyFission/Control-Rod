package agentupdate

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func fakeEnv(paths map[string]string, versions map[string]string, latest map[string]string) Env {
	return Env{
		LookPath: func(b string) (string, error) {
			if p, ok := paths[b]; ok {
				return p, nil
			}
			return "", errors.New("not found")
		},
		EvalSymlinks: func(p string) (string, error) { return p, nil },
		Version: func(_ context.Context, p string) (string, error) {
			if v, ok := versions[p]; ok {
				return v, nil
			}
			return "", errors.New("no answer")
		},
		Latest: func(_ context.Context, pkg string) (string, error) {
			if v, ok := latest[pkg]; ok {
				return v, nil
			}
			return "", errors.New("offline")
		},
		NpmRoot: func(context.Context) (string, error) { return "/usr/lib/node_modules", nil },
	}
}

func TestNewer(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"1.0.92", "1.0.77", true},
		{"1.0.77", "1.0.92", false},
		{"1.19.6", "1.19.6", false},
		{"2.0.0", "1.99.99", true},
		{"1.10.0", "1.9.0", true}, // numeric, not string, order
		{"1.0.0", "1.0.0-beta.1", true},
		{"1.0.0-beta.1", "1.0.0", false},
		{"garbage", "1.0.0", false},
	}
	for _, c := range cases {
		if got := Newer(c.a, c.b); got != c.want {
			t.Errorf("Newer(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestCheckOffersNpmCommandOnlyForNpmInstalls(t *testing.T) {
	env := fakeEnv(
		map[string]string{
			"grok":     "/usr/lib/node_modules/@xai-official/grok/bin/grok",
			"opencode": "/opt/homebrew/Cellar/opencode/1.19.5/bin/opencode",
			"agy":      "/usr/local/bin/agy",
		},
		map[string]string{
			"/usr/lib/node_modules/@xai-official/grok/bin/grok": "grok 1.0.77\n",
			"/opt/homebrew/Cellar/opencode/1.19.5/bin/opencode": "1.19.5",
			"/usr/local/bin/agy": "agy version 0.4.1",
		},
		map[string]string{"@xai-official/grok": "1.0.92", "opencode-ai": "1.19.6"},
	)
	sts := Check(context.Background(), env, Catalog)
	if len(sts) != 3 {
		t.Fatalf("want the 3 installed agents, got %d", len(sts))
	}
	by := map[string]Status{}
	for _, s := range sts {
		by[s.Agent.ID] = s
	}
	g := by["grok"]
	if !g.Outdated() || strings.Join(g.Command, " ") != "npm install --global @xai-official/grok@1.0.92" {
		t.Fatalf("grok: %+v", g)
	}
	o := by["opencode"]
	if !o.Outdated() || o.Command != nil || !strings.Contains(o.Note, "outside npm") {
		t.Fatalf("a Homebrew install must get no command: %+v", o)
	}
	a := by["agy"]
	if a.Outdated() || a.Command != nil || a.Latest != "" || a.Installed != "0.4.1" {
		t.Fatalf("agy has no known package: %+v", a)
	}
	if got := Summary(sts); !strings.HasPrefix(got, "2 agent updates: OpenCode 1.19.5 -> 1.19.6, Grok CLI 1.0.77 -> 1.0.92.") {
		t.Fatalf("summary: %q", got)
	}
}

func TestCheckRefusesAVersionThatCouldCarryArguments(t *testing.T) {
	env := fakeEnv(
		map[string]string{"codex": "/usr/lib/node_modules/@openai/codex/bin/codex.js"},
		map[string]string{"/usr/lib/node_modules/@openai/codex/bin/codex.js": "codex-cli 0.100.0"},
		map[string]string{"@openai/codex": "9.9.9 --registry=https://evil.example"},
	)
	s := Check(context.Background(), env, Catalog)[0]
	if s.Command != nil || s.Latest != "" || s.Outdated() {
		t.Fatalf("a malformed registry version reached a command: %+v", s)
	}
}

func TestCheckOfflineIsQuiet(t *testing.T) {
	env := fakeEnv(
		map[string]string{"claude": "/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js"},
		map[string]string{"/usr/lib/node_modules/@anthropic-ai/claude-code/cli.js": "2.1.300 (Claude Code)"},
		nil,
	)
	sts := Check(context.Background(), env, Catalog)
	if Summary(sts) != "" || sts[0].Command != nil || !strings.Contains(sts[0].Note, "unavailable") {
		t.Fatalf("offline: %+v", sts)
	}
}

func TestRegistryLatest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.EscapedPath() != "/@xai-official%2Fgrok/latest" {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write([]byte(`{"name":"@xai-official/grok","version":"1.0.92"}`))
	}))
	defer srv.Close()
	v, err := RegistryLatest(srv.Client(), srv.URL+"/")(context.Background(), "@xai-official/grok")
	if err != nil || v != "1.0.92" {
		t.Fatalf("got %q, %v", v, err)
	}
	if _, err := RegistryLatest(srv.Client(), srv.URL)(context.Background(), "missing"); err == nil {
		t.Fatal("a 404 must be an error")
	}
}

func TestStrictVersionIsSemVer(t *testing.T) {
	for _, v := range []string{"1.0.92", "0.0.1", "10.20.30", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-0.3.7", "1.0.0-x-y-z.--", "2.1.330"} {
		if !StrictVersion(v) {
			t.Errorf("%q should be accepted", v)
		}
	}
	for _, v := range []string{"01.0.0", "1.02.0", "1.0.03", "1.0.0-", "1.0.0-alpha..1", "1.0.0-01", "1.0.0+build", "1.0", "v1.0.0", "1.0.0 --registry=x", ""} {
		if StrictVersion(v) {
			t.Errorf("%q should be refused", v)
		}
	}
}

func TestOnlyTheGlobalNpmCopyGetsACommand(t *testing.T) {
	latest := map[string]string{"@openai/codex": "0.171.0"}
	for path, want := range map[string]bool{
		"/usr/lib/node_modules/@openai/codex/bin/codex.js":                       true,
		"/home/u/project/node_modules/@openai/codex/bin/codex.js":                false, // project-local
		"/home/u/.local/share/pnpm/global/5/node_modules/@openai/codex/bin/x.js": false, // pnpm
		"/usr/lib/node_modules/@openai/codex-other/bin/codex.js":                 false,
	} {
		env := fakeEnv(map[string]string{"codex": path}, map[string]string{path: "codex-cli 0.170.0"}, latest)
		got := Check(context.Background(), env, Catalog)[0].Command != nil
		if got != want {
			t.Errorf("%s: command offered = %v, want %v", path, got, want)
		}
	}
	env := fakeEnv(map[string]string{"codex": "/usr/lib/node_modules/@openai/codex/bin/codex.js"},
		map[string]string{"/usr/lib/node_modules/@openai/codex/bin/codex.js": "0.170.0"}, latest)
	env.NpmRoot = func(context.Context) (string, error) { return "", errors.New("no npm") }
	if Check(context.Background(), env, Catalog)[0].Command != nil {
		t.Error("without npm's global root no command may be offered")
	}
}

// SemVer 2.0 section 11's own example order, plus the case a release candidate update relies on.
func TestNewerFollowsSemVerPrereleasePrecedence(t *testing.T) {
	order := []string{"1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0"}
	for i := range order {
		for j := range order {
			if got, want := Newer(order[i], order[j]), i > j; got != want {
				t.Errorf("Newer(%q, %q) = %v, want %v", order[i], order[j], got, want)
			}
		}
	}
	if !Newer("1.2.3-rc.2", "1.2.3-rc.1") || Newer("1.2.3-rc.1", "1.2.3-rc.2") {
		t.Error("rc.2 must be newer than rc.1")
	}
	if Newer("1.2.3-rc.1", "1.2.3-rc.1") {
		t.Error("a version is not newer than itself")
	}
}

// The strict check agrees with the spec's 64-byte cap on latest.
func TestStrictVersionFitsTheSpecLimit(t *testing.T) {
	v := "1.0.0-" + strings.Repeat("a", 58) // 64 bytes
	if !StrictVersion(v) || StrictVersion(v+"a") {
		t.Fatalf("64 bytes must pass and 65 must not: %d", len(v))
	}
}

func TestIncompleteIsNeitherCurrentNorOutdated(t *testing.T) {
	grok := Catalog[4]
	for _, s := range []Status{{Agent: grok, Installed: "1.0.77"}, {Agent: grok, Latest: "1.0.92"}} {
		if !s.Incomplete() || s.Outdated() {
			t.Errorf("%+v: incomplete %v, outdated %v", s, s.Incomplete(), s.Outdated())
		}
	}
	if (Status{Agent: grok, Installed: "1.0.92", Latest: "1.0.92"}).Incomplete() {
		t.Error("a full check counted incomplete")
	}
}

// A prerelease made of hyphens is read whole, and numeric identifiers longer than 64 bits still
// order by value (length, then digits) instead of falling back to text order.
func TestPrereleaseEdgesFollowSemVer(t *testing.T) {
	if v := ParseVersion("grok 1.2.3-- (build)"); v != "1.2.3--" {
		t.Fatalf("ParseVersion read %q", v)
	}
	if !Newer("1.2.3", "1.2.3--") || Newer("1.2.3--", "1.2.3") {
		t.Fatal("1.2.3-- must be a prerelease of 1.2.3")
	}
	big, bigger := "1.2.3-18446744073709551616", "1.2.3-99999999999999999999"
	if !Newer(bigger, big) || Newer(big, bigger) {
		t.Fatal("long numeric identifiers must compare by value")
	}
	if !Newer("1.2.3-10", "1.2.3-9") || !Newer("1.2.3-a", "1.2.3-"+strings.Repeat("9", 30)) {
		t.Fatal("numeric below alphanumeric, and by value")
	}
}

// A version that is not strict SemVer is not read at all, so the agent counts as unchecked.
func TestParseVersionReadsOnlyStrictSemVer(t *testing.T) {
	for in, want := range map[string]string{
		"1.2.3-":               "",
		"tool 1.2.3+build.5":   "",
		"1.2.3-rc.01":          "",
		"1.2.3-rc.1 (abc)":     "1.2.3-rc.1",
		"codex-cli 0.171.0":    "0.171.0",
		"v1.2.3":               "",
		"1.2.3\n":              "1.2.3",
		"Grok CLI, 1.0.92 x64": "1.0.92",
	} {
		if got := ParseVersion(in); got != want {
			t.Errorf("ParseVersion(%q) = %q, want %q", in, got, want)
		}
	}
}

// Stamp changes when the binary on PATH is replaced and is "" when it is gone; it runs nothing.
func TestStampSeesAReplacedBinary(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "grok")
	if err := os.WriteFile(bin, []byte("v1"), 0o755); err != nil {
		t.Fatal(err)
	}
	env := Env{LookPath: func(string) (string, error) { return bin, nil }, EvalSymlinks: filepath.EvalSymlinks, Stat: os.Stat}
	a := Stamp(env, "grok")
	if a == "" || Stamp(env, "grok") != a {
		t.Fatalf("stamp %q not stable", a)
	}
	if err := os.WriteFile(bin, []byte("v2 longer"), 0o755); err != nil {
		t.Fatal(err)
	}
	if b := Stamp(env, "grok"); b == a || b == "" {
		t.Fatalf("replaced binary kept stamp %q", b)
	}
	env.LookPath = func(string) (string, error) { return "", os.ErrNotExist }
	if Stamp(env, "grok") != "" {
		t.Fatal("a missing binary has a stamp")
	}
}

// Check takes each agent's stamp with its version, so the daemon can tell a later change.
func TestCheckStampsEachAgent(t *testing.T) {
	dir := t.TempDir()
	bin := filepath.Join(dir, "grok")
	if err := os.WriteFile(bin, []byte("x"), 0o755); err != nil {
		t.Fatal(err)
	}
	env := fakeEnv(map[string]string{"grok": bin}, map[string]string{bin: "1.0.77"}, map[string]string{"@xai-official/grok": "1.0.92"})
	env.Stat = os.Stat
	sts := Check(context.Background(), env, []Agent{Catalog[4]})
	if len(sts) != 1 || sts[0].Stamp == "" || sts[0].Stamp != Stamp(env, "grok") {
		t.Fatalf("stamp not taken: %#v", sts)
	}
}
