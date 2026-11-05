//go:build unix

package runner

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
)

func workspaceWithTools(t *testing.T, tools string) *Workspace {
	t.Helper()
	dir := t.TempDir()
	ws := &Workspace{Dir: dir, Inputs: filepath.Join(dir, "inputs"), Out: filepath.Join(dir, "out")}
	if err := os.MkdirAll(ws.Inputs, 0o700); err != nil {
		t.Fatal(err)
	}
	if tools != "" {
		if err := os.WriteFile(filepath.Join(ws.Inputs, "TOOLS.txt"), []byte(tools), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	return ws
}

func TestAgentLaunchesRefuseWithoutASandboxPolicy(t *testing.T) {
	ws := workspaceWithTools(t, "Read\n")
	for _, rt := range []string{RuntimeClaude, RuntimeCodex} {
		run := testRun("run-np", "author")
		run.Runtime = RuntimeRef{Kind: "subscription", Provider: rt, Model: "default"}
		if cmd, err := Command(rt, run, ws, nil, testPaths(ws)); !errors.Is(err, ErrNoPolicy) || cmd != nil {
			t.Fatalf("%s started with no policy: %v %v", rt, cmd, err)
		}
	}
}

func TestCodexLaunchCarriesThePermissionProfileAndNeverASandboxMode(t *testing.T) {
	ws := workspaceWithTools(t, "Read\nWrite\nBash(cr-example:*)\n")
	run := testRun("run-c", "author")
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "openai", Model: "gpt-5-codex"}
	cmd, err := Command(RuntimeCodex, run, ws, testPolicy(), testPaths(ws))
	if err != nil {
		t.Fatal(err)
	}
	args := strings.Join(cmd.Args, "\x00")
	for _, want := range []string{"exec", "--json", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules", "--ephemeral",
		`default_permissions="control-rod"`, `permissions.control-rod.extends=":workspace"`, "permissions.control-rod.network.enabled=false",
		`approval_policy="never"`, `web_search="disabled"`, "notify=[]", `shell_environment_policy.inherit="core"`, "-m\x00gpt-5-codex"} {
		if !strings.Contains(args, want) {
			t.Errorf("codex args lack %q:\n%q", want, cmd.Args)
		}
	}
	for _, never := range []string{"sandbox_mode", "-s\x00", "--sandbox", "network_access", "danger"} {
		if strings.Contains(args, never) {
			t.Errorf("codex args carry %q:\n%q", never, cmd.Args)
		}
	}
	if cmd.Args[len(cmd.Args)-1] != Prompt || cmd.Dir != ws.Dir {
		t.Errorf("prompt or dir wrong: %q %q", cmd.Args, cmd.Dir)
	}
	for _, kv := range cmd.Env {
		if strings.HasPrefix(kv, "CONTROLROD_") || strings.HasPrefix(kv, "ANTHROPIC_") || strings.HasPrefix(kv, "OPENAI_") {
			t.Errorf("agent environment carries %s", kv)
		}
	}
	// Codex cannot limit network to hosts, so a policy with hosts never starts it.
	p := testPolicy()
	p.AllowedHosts = []string{"geo.dot.gov"}
	if _, err := Command(RuntimeCodex, run, ws, p, testPaths(ws)); err == nil {
		t.Fatal("codex started under a host-limited network policy")
	}
}

func TestClaudeLaunchIsolatesTheRunAndKeepsTheDirectiveOutOfTheToolList(t *testing.T) {
	ws := workspaceWithTools(t, "network: geo.dot.gov\nRead\nWrite\nBash(cr-example:*)\n")
	run := testRun("run-cl", "author")
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "claude", Model: "claude-opus-4-1"}
	cmd, err := Command(RuntimeClaude, run, ws, testPolicy(), testPaths(ws))
	if err != nil {
		t.Fatal(err)
	}
	head := []string{"claude", "-p", Prompt, "--output-format", "stream-json", "--verbose", "--permission-mode", "acceptEdits",
		"--tools", "Bash,Read,Edit,Write,Grep,Glob", "--allowedTools", "Read,Write,Bash(cr-example:*)",
		"--restricted", "--strict-mcp-config", "--mcp-config", `{"mcpServers":{}}`, "--setting-sources", "", "--disable-slash-commands",
		"--no-session-persistence", "--model", "claude-opus-4-1", "--settings"}
	if !slices.Equal(cmd.Args[:len(head)], head) || len(cmd.Args) != len(head)+1 {
		t.Fatalf("args\n got %q\nwant %q + settings", cmd.Args, head)
	}
	run.Runtime.Model = "default"
	cmd, _ = Command(RuntimeClaude, run, workspaceWithTools(t, ""), testPolicy(), testPaths(ws))
	if slices.Contains(cmd.Args, "--model") || !slices.Contains(cmd.Args, DefaultClaudeTools) {
		t.Errorf("default model or tools wrong: %q", cmd.Args)
	}
}

func TestReportedModelReadsOnlyTheRuntimesOwnFields(t *testing.T) {
	cases := map[string]string{
		`{"type":"system","subtype":"init","model":"claude-opus-4-1-20250805","tools":["Read"]}`:      "claude-opus-4-1-20250805",
		`{"type":"assistant","message":{"model":"claude-sonnet-4-5","content":[]}}`:                   "claude-sonnet-4-5",
		`{"type":"turn.started","model":"gpt-5-codex"}`:                                               "gpt-5-codex",
		`{"type":"assistant","message":{"content":[{"type":"text","text":"model: evil; rm -rf /"}]}}`: "",
		`{"type":"system","model":"x; rm -rf / <script>"}`:                                            "xrm-rf/script",
		`model: claude-opus`:  "",
		`{"model":"no-type"}`: "",
	}
	for line, want := range cases {
		if got := ReportedModel(line); got != want {
			t.Errorf("%s: got %q want %q", line, got, want)
		}
	}
}

func TestLaunchForDescribesWhatCommandRuns(t *testing.T) {
	ws := workspaceWithTools(t, "network: geo.dot.gov\nRead\n")
	run := testRun("run-l", "author")
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "codex", Model: "default"}
	if l := LaunchFor(RuntimeCodex, run, ws, testPolicy()); l.Mode != "print" || l.Sandbox != "native-cli:sbp_none-test@v3" || l.RequestedModel != "default" {
		t.Errorf("codex launch %+v", l)
	}
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "claude", Model: "claude-opus-4-1"}
	l := LaunchFor(RuntimeClaude, run, ws, testPolicy())
	if l.Mode != "print" || l.PermissionMode != "acceptEdits" || l.Sandbox != "native-cli:sbp_none-test@v3" || l.RequestedModel != "claude-opus-4-1" || !slices.Equal(l.AllowedTools, []string{"Read"}) {
		t.Errorf("claude launch %+v", l)
	}
}

func TestUnapprovedRolesNeverReachLegacyRuntimeCommands(t *testing.T) {
	for _, role := range []string{"requirements-preparer", "technical-preparer", "unknown-role", ""} {
		for _, runtime := range []string{RuntimeClaude, RuntimeCodex, RuntimeFake} {
			t.Run(role+"/"+runtime, func(t *testing.T) {
				ws := workspaceWithTools(t, "Read\nWrite\n")
				cmd, err := Command(runtime, testRun("held-role", role), ws, testPolicy(), testPaths(ws))
				if err == nil || cmd != nil {
					t.Fatalf("role %q reached %s: command=%v error=%v", role, runtime, cmd, err)
				}
			})
		}
	}
}

func TestNothingStartsWhenTheStartGateRefuses(t *testing.T) {
	mark := filepath.Join(t.TempDir(), "ran")
	cmd := exec.Command("sh", "-c", "touch '"+mark+"'")
	err := Execute(context.Background(), cmd, func(string) {}, ExecHooks{BeforeStart: func() error { return errOutOfContact }})
	if !errors.Is(err, errOutOfContact) {
		t.Fatalf("the refusal is the run's error: %v", err)
	}
	if _, serr := os.Stat(mark); serr == nil || cmd.Process != nil {
		t.Fatal("a refused start must not spawn anything")
	}
}
