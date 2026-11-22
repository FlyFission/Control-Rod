package agentupdate

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
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
		map[string]string{"codex": "/x/node_modules/@openai/codex/bin/codex.js"},
		map[string]string{"/x/node_modules/@openai/codex/bin/codex.js": "codex-cli 0.100.0"},
		map[string]string{"@openai/codex": "9.9.9 --registry=https://evil.example"},
	)
	s := Check(context.Background(), env, Catalog)[0]
	if s.Command != nil || s.Latest != "" || s.Outdated() {
		t.Fatalf("a malformed registry version reached a command: %+v", s)
	}
}

func TestCheckOfflineIsQuiet(t *testing.T) {
	env := fakeEnv(
		map[string]string{"claude": "/x/node_modules/@anthropic-ai/claude-code/cli.js"},
		map[string]string{"/x/node_modules/@anthropic-ai/claude-code/cli.js": "2.1.300 (Claude Code)"},
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
