package runner

import (
	"os"
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
