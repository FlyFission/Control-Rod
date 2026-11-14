//go:build unix

package runner

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// goldenPrefix replaces the test's temporary root in the captured launch, so the fixtures
// stay byte-stable without a shared directory under /tmp.
const goldenPrefix = "/golden"

// goldenEnviron is the process environment Command sees while the fixtures are made
// and read. Values that an agent CLI must not receive are included so a leak fails
// the byte comparison. They are test stand-ins, not credentials.
var goldenEnviron = []string{
	"HOME=/home/owner",
	"USER=owner",
	"LOGNAME=owner",
	"SHELL=/bin/bash",
	"PATH=/usr/local/bin:/usr/bin:/bin",
	"LANG=C.UTF-8",
	"LANGUAGE=en",
	"LC_ALL=C.UTF-8",
	"TZ=UTC",
	"TERM=xterm-256color",
	"TMPDIR=/tmp",
	"CODEX_HOME=/home/owner/.codex",
	"CLAUDE_CONFIG_DIR=/home/owner/.claude",
	"NO_COLOR=1",
	"COLORTERM=truecolor",
	"ANTHROPIC_API_KEY=sk-ant-test",
	"ANTHROPIC_BASE_URL=https://example.invalid",
	"ANTHROPIC_MODEL=claude-x",
	"CLAUDE_CODE_OAUTH_TOKEN=oauth-test",
	"OPENAI_API_KEY=sk-openai-test",
	"OPENAI_BASE_URL=https://api.example.invalid",
	"XAI_API_KEY=xai-test",
	"GEMINI_API_KEY=gem-test",
	"GOOGLE_API_KEY=goog-test",
	"OLLAMA_HOST=http://127.0.0.1:11434",
	"OLLAMA_API_KEY=ollama-test",
	"HTTP_PROXY=http://proxy.example:8080",
	"HTTPS_PROXY=http://proxy.example:8443",
	"ALL_PROXY=socks5://proxy.example:1080",
	"SSH_AUTH_SOCK=/tmp/ssh-agent.sock",
	"CONTROLROD_DAEMON_TOKEN=daemon-token",
	"npm_config_prefix=/opt/node",
}

type launchCase struct {
	id      string
	runtime string
	role    string
	model   string
	tools   string
}

// launchCases are the pre-refactor captures. Author with default tools uses model
// "default", which is also the model-default case. The network-hosts tools file is
// the Claude case the milestone names; Codex is captured on the same input.
var launchCases = []launchCase{
	{id: "claude-author-default-tools", runtime: RuntimeClaude, role: "author", model: "default"},
	{id: "claude-author-explicit-model", runtime: RuntimeClaude, role: "author", model: "claude-opus-4-1"},
	{id: "claude-pre-check", runtime: RuntimeClaude, role: "pre-check", model: "default"},
	{id: "claude-intake", runtime: RuntimeClaude, role: "intake", model: "default"},
	{id: "claude-author-network-hosts", runtime: RuntimeClaude, role: "author", model: "default",
		tools: "network: docs.example.org, standards.example.org\nRead\n"},
	{id: "codex-author-default-tools", runtime: RuntimeCodex, role: "author", model: "default"},
	{id: "codex-author-explicit-model", runtime: RuntimeCodex, role: "author", model: "gpt-5-codex"},
	{id: "codex-pre-check", runtime: RuntimeCodex, role: "pre-check", model: "default"},
	{id: "codex-intake", runtime: RuntimeCodex, role: "intake", model: "default"},
	{id: "codex-author-network-hosts", runtime: RuntimeCodex, role: "author", model: "default",
		tools: "network: docs.example.org, standards.example.org\nRead\n"},
}

type launchGolden struct {
	Argv   []string `json:"argv"`
	Env    []string `json:"env"`
	Dir    string   `json:"dir"`
	Launch Launch   `json:"launch"`
}

func prepareGoldenRoot(t *testing.T) (string, *SandboxPolicy) {
	t.Helper()
	root := t.TempDir()
	for _, d := range []string{"home/.claude", "home/.codex", "home/.ssh", "home/.controlrod", "mnt"} {
		if err := os.MkdirAll(filepath.Join(root, d), 0o700); err != nil {
			t.Fatal(err)
		}
	}
	// The host path "/mnt" in testPolicy is replaced by a directory this test creates,
	// so Codex's denial set does not depend on whether the machine has /mnt. Every other
	// field matches testPolicy.
	p := testPolicy()
	denied := append([]string{}, p.DeniedRead...)
	denied[len(denied)-1] = filepath.Join(root, "mnt")
	p.DeniedRead = denied
	return root, p
}

func TestLaunchGolden(t *testing.T) {
	root, p := prepareGoldenRoot(t)
	writeGolden := os.Getenv("CONTROLROD_WRITE_LAUNCH_GOLDEN") == "1"
	withGoldenEnv(t, func() {
		for _, c := range launchCases {
			t.Run(c.id, func(t *testing.T) {
				got := normalizeLaunch(root, captureLaunch(t, root, p, c))
				path := filepath.Join("testdata", "launch-golden", c.id+".json")
				raw := mustGoldenJSON(t, got)
				if writeGolden {
					if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
						t.Fatal(err)
					}
					if err := os.WriteFile(path, raw, 0o644); err != nil {
						t.Fatal(err)
					}
				}
				want, err := os.ReadFile(path)
				if err != nil {
					t.Fatalf("read golden: %v", err)
				}
				if string(want) != string(raw) {
					t.Fatalf("launch bytes differ from the pre-refactor fixture %s\n got %s\nwant %s", path, raw, want)
				}
			})
		}
	})
}

func captureLaunch(t *testing.T, root string, p *SandboxPolicy, c launchCase) launchGolden {
	t.Helper()
	dir := filepath.Join(root, "ws-"+c.id)
	ws := &Workspace{Dir: dir, Inputs: filepath.Join(dir, "inputs"), Out: filepath.Join(dir, "out")}
	if err := os.MkdirAll(ws.Inputs, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(ws.Out, 0o700); err != nil {
		t.Fatal(err)
	}
	if c.tools != "" {
		if err := os.WriteFile(filepath.Join(ws.Inputs, "TOOLS.txt"), []byte(c.tools), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	run := testRun("run-"+c.id, c.role)
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: c.runtime, Model: c.model}
	at := SandboxPaths{
		Home:       filepath.Join(root, "home"),
		DaemonHome: filepath.Join(root, "home", ".controlrod"),
		Workspace:  ws.Dir,
	}
	cmd, err := Command(c.runtime, run, ws, p, at)
	if err != nil || cmd == nil {
		t.Fatalf("Command: %v", err)
	}
	return launchGolden{
		Argv:   append([]string{}, cmd.Args...),
		Env:    append([]string{}, cmd.Env...),
		Dir:    cmd.Dir,
		Launch: LaunchFor(c.runtime, run, ws, p),
	}
}

func withGoldenEnv(t *testing.T, fn func()) {
	t.Helper()
	old := os.Environ()
	os.Clearenv()
	for _, kv := range goldenEnviron {
		k, v, _ := strings.Cut(kv, "=")
		if err := os.Setenv(k, v); err != nil {
			t.Fatal(err)
		}
	}
	defer func() {
		os.Clearenv()
		for _, kv := range old {
			k, v, _ := strings.Cut(kv, "=")
			_ = os.Setenv(k, v)
		}
	}()
	fn()
}

func normalizeLaunch(root string, g launchGolden) launchGolden {
	rep := func(s string) string { return strings.ReplaceAll(s, root, goldenPrefix) }
	for i := range g.Argv {
		g.Argv[i] = rep(g.Argv[i])
	}
	for i := range g.Env {
		g.Env[i] = rep(g.Env[i])
	}
	g.Dir = rep(g.Dir)
	g.Launch.Mode = rep(g.Launch.Mode)
	g.Launch.RequestedModel = rep(g.Launch.RequestedModel)
	g.Launch.PermissionMode = rep(g.Launch.PermissionMode)
	g.Launch.Sandbox = rep(g.Launch.Sandbox)
	if g.Launch.AllowedTools != nil {
		tools := append([]string{}, g.Launch.AllowedTools...)
		for i := range tools {
			tools[i] = rep(tools[i])
		}
		g.Launch.AllowedTools = tools
	}
	return g
}

func mustGoldenJSON(t *testing.T, g launchGolden) []byte {
	t.Helper()
	b, err := json.MarshalIndent(g, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return append(b, '\n')
}
