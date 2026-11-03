//go:build unix

package runner

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
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

func TestCodexLaunchWritesItsWorkspaceWithoutNetworkByDefault(t *testing.T) {
	ws := workspaceWithTools(t, "Read\nWrite\nBash(cr-site:*)\n")
	run := testRun("run-c", "author")
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "codex", Model: "default"}
	cmd, err := Command(RuntimeCodex, run, ws)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"codex", "exec", "--json", "-s", "workspace-write", "--skip-git-repo-check", "-C", ws.Dir, Prompt}
	if !slices.Equal(cmd.Args, want) {
		t.Fatalf("args\n got %q\nwant %q", cmd.Args, want)
	}
	if cmd.Dir != ws.Dir {
		t.Errorf("dir %q", cmd.Dir)
	}
}

func TestCodexLaunchGetsNetworkOnlyWhenTheJobAsksAndPassesTheModel(t *testing.T) {
	ws := workspaceWithTools(t, "# site constraints\nnetwork: on\nRead\nBash(cr-site:*)\n")
	run := testRun("run-n", "author")
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "openai", Model: "gpt-5-codex"}
	cmd, err := Command(RuntimeCodex, run, ws)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"codex", "exec", "--json", "-s", "workspace-write", "--skip-git-repo-check", "-C", ws.Dir,
		"-m", "gpt-5-codex", "-c", "sandbox_workspace_write.network_access=true", Prompt}
	if !slices.Equal(cmd.Args, want) {
		t.Fatalf("args\n got %q\nwant %q", cmd.Args, want)
	}
	for _, v := range []string{"network: off", "network: yes please", ""} {
		ws := workspaceWithTools(t, "Read\n"+v+"\n")
		if NeedsNetwork(ws) {
			t.Errorf("%q must not turn network on", v)
		}
	}
}

func TestClaudeLaunchArgsKeepTheDirectiveOutOfTheToolList(t *testing.T) {
	ws := workspaceWithTools(t, "network: on\nRead\nWrite\nBash(cr-site:*)\n")
	run := testRun("run-cl", "author")
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "claude", Model: "claude-opus-4-1"}
	cmd, err := Command(RuntimeClaude, run, ws)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"claude", "-p", Prompt, "--output-format", "stream-json", "--verbose",
		"--permission-mode", "acceptEdits", "--allowedTools", "Read,Write,Bash(cr-site:*)", "--model", "claude-opus-4-1"}
	if !slices.Equal(cmd.Args, want) {
		t.Fatalf("args\n got %q\nwant %q", cmd.Args, want)
	}
	run.Runtime.Model = "default"
	cmd, _ = Command(RuntimeClaude, run, workspaceWithTools(t, ""))
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
	ws := workspaceWithTools(t, "network: on\nRead\n")
	run := testRun("run-l", "author")
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "codex", Model: "default"}
	if l := LaunchFor(RuntimeCodex, run, ws); l.Mode != "print" || l.Sandbox != "workspace-write+network" || l.RequestedModel != "default" {
		t.Errorf("codex launch %+v", l)
	}
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "claude", Model: "claude-opus-4-1"}
	l := LaunchFor(RuntimeClaude, run, ws)
	if l.Mode != "print" || l.PermissionMode != "acceptEdits" || l.Sandbox != "none" || l.RequestedModel != "claude-opus-4-1" || !slices.Equal(l.AllowedTools, []string{"Read"}) {
		t.Errorf("claude launch %+v", l)
	}
}

func TestUnapprovedRolesNeverReachLegacyRuntimeCommands(t *testing.T) {
	for _, role := range []string{"requirements-preparer", "technical-preparer", "unknown-role", ""} {
		for _, runtime := range []string{RuntimeClaude, RuntimeCodex, RuntimeFake} {
			t.Run(role+"/"+runtime, func(t *testing.T) {
				cmd, err := Command(runtime, testRun("held-role", role), workspaceWithTools(t, "Read\nWrite\n"))
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
