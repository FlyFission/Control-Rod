//go:build unix

package runner

import (
	"bufio"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestRegistry(t *testing.T) {
	if len(Adapters) != 3 {
		t.Fatalf("registry %d", len(Adapters))
	}
	wantOrder := []string{RuntimeClaude, RuntimeCodex, RuntimeFake}
	seen := map[string]bool{}
	var ids []string
	for _, a := range Adapters {
		id := a.ID()
		if id == "" || a.Binary() == "" {
			t.Fatalf("%q id or binary empty", id)
		}
		c := a.Capabilities()
		if len(c.Roles) == 0 || c.OutputFormat == "" {
			t.Fatalf("%s capabilities roles %q format %q", id, c.Roles, c.OutputFormat)
		}
		if seen[id] {
			t.Fatalf("duplicate id %s", id)
		}
		seen[id] = true
		ids = append(ids, id)
		got, ok := AdapterFor(id)
		if !ok || got.ID() != id {
			t.Fatalf("AdapterFor %s", id)
		}
	}
	if !slices.Equal(ids, wantOrder) {
		t.Fatalf("order %v", ids)
	}
	if _, ok := AdapterFor("grok"); ok {
		t.Fatal("unregistered id resolved")
	}

	missing := func(string) (string, error) { return "", errors.New("missing") }
	found := func(name string) (string, error) {
		if name == "claude" || name == "codex" {
			return "/bin/" + name, nil
		}
		return "", errors.New("missing")
	}
	off := func(string) string { return "" }
	on := func(k string) string {
		if k == "CONTROLROD_ALLOW_FAKE" {
			return "1"
		}
		return ""
	}
	if got := Detect(missing, off); len(got) != 0 {
		t.Fatalf("detect with nothing: %v", got)
	}
	if got := Detect(found, off); !slices.Equal(got, []string{RuntimeClaude, RuntimeCodex}) {
		t.Fatalf("detect without fake: %v", got)
	}
	if got := Detect(found, on); !slices.Equal(got, []string{RuntimeClaude, RuntimeCodex, RuntimeFake}) {
		t.Fatalf("detect with fake: %v", got)
	}
	if got := Detect(missing, on); !slices.Equal(got, []string{RuntimeFake}) {
		t.Fatalf("fake alone: %v", got)
	}
	if got := Detect(missing, func(string) string { return "0" }); len(got) != 0 {
		t.Fatalf("fake when the flag is not 1: %v", got)
	}

	for _, c := range []struct{ provider, runtime string }{
		{"claude", RuntimeClaude}, {"Anthropic", RuntimeClaude}, {"claude-code", RuntimeClaude},
		{"codex", RuntimeCodex}, {"OpenAI", RuntimeCodex},
		{"fake", RuntimeFake}, {"nope", ""}, {"", ""},
	} {
		if got := RuntimeFor(c.provider); got != c.runtime {
			t.Errorf("RuntimeFor %q = %q, want %q", c.provider, got, c.runtime)
		}
	}
}

func TestAdapterStreamMatchesNormalize(t *testing.T) {
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		file string
		id   string
	}{
		{"claude-stream.jsonl", RuntimeClaude},
		{"codex-stream.jsonl", RuntimeCodex},
	} {
		t.Run(c.id, func(t *testing.T) {
			a, ok := AdapterFor(c.id)
			if !ok {
				t.Fatal(c.id)
			}
			f, err := os.Open(filepath.Join("testdata", c.file))
			if err != nil {
				t.Fatal(err)
			}
			defer f.Close()
			sc := bufio.NewScanner(f)
			n := 0
			for sc.Scan() {
				line := sc.Text()
				if strings.TrimSpace(line) == "" {
					continue
				}
				n++
				if !reflect.DeepEqual(a.Normalize(line, now), Normalize(line, now)) {
					t.Fatalf("%s line %d events differ: %s", c.file, n, line)
				}
				ae, afailed := a.TurnEnd(line)
				ended, failed := TurnEnd(line)
				if ae != ended || afailed != failed {
					t.Fatalf("%s line %d TurnEnd adapter %v %v function %v %v", c.file, n, ae, afailed, ended, failed)
				}
			}
			if err := sc.Err(); err != nil {
				t.Fatal(err)
			}
			if n == 0 {
				t.Fatal("no lines")
			}
		})
	}
}

func TestAgentEnvDropsProviderProvenance(t *testing.T) {
	keys := []string{
		"ANTHROPIC_BASE_URL", "ANTHROPIC_MODEL", "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN",
		"OPENAI_BASE_URL", "OPENAI_API_KEY", "XAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY",
		"OLLAMA_HOST", "OLLAMA_API_KEY", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SSH_AUTH_SOCK",
	}
	for _, key := range keys {
		t.Run(key, func(t *testing.T) {
			got := AgentEnv([]string{"HOME=/home/owner", "PATH=/usr/bin", key + "=secret"})
			for _, kv := range got {
				if strings.HasPrefix(kv, key+"=") {
					t.Fatalf("AgentEnv keeps %s; the allowlist is unchanged and this key must be dropped", key)
				}
			}
		})
	}
}

func TestUnknownRuntimeMatchesTodaysError(t *testing.T) {
	ws := workspaceWithTools(t, "Read\n")
	run := testRun("run-unknown", "author")
	_, err := Command("not-a-runtime", run, ws, testPolicy(), testPaths(ws))
	want := `runtime "not-a-runtime" is not available on this machine`
	if err == nil || err.Error() != want {
		t.Fatalf("got %v", err)
	}
}

func TestLogIngestionUsesTheAdapter(t *testing.T) {
	line := "not json at all"
	if Normalize(line, time.Unix(0, 0).UTC()) != nil {
		t.Fatal("the fixture line must be one the shared parser ignores")
	}
	if ended, failed := TurnEnd(line); ended || failed {
		t.Fatal("the fixture line must not end a turn in the shared parser")
	}
	adapt := callAdapter{
		events: []Event{{Kind: EvNotice, Text: "from-adapter"}},
		ended:  true,
		failed: true,
	}
	buf := &logBuffer{adapt: adapt}
	buf.add(line)
	if !buf.turnOver || !buf.turnFailed {
		t.Fatal("ingestion did not use the adapter's TurnEnd")
	}
	if len(buf.events) != 1 || buf.events[0].Text != "from-adapter" {
		t.Fatalf("ingestion events %+v", buf.events)
	}
}

// callAdapter is a stream parser installed on a log buffer to prove ingestion calls it.
type callAdapter struct {
	events []Event
	ended  bool
	failed bool
}

func (callAdapter) ID() string     { return "call" }
func (callAdapter) Binary() string { return "call" }
func (callAdapter) Capabilities() Capabilities {
	return Capabilities{Roles: []string{"author"}, OutputFormat: "text"}
}
func (callAdapter) Providers() []string { return []string{"call"} }
func (callAdapter) Available(func(string) (string, error), func(string) string) bool {
	return false
}
func (callAdapter) Probe(context.Context, CommandRunner) RuntimeStatus { return RuntimeStatus{} }
func (callAdapter) Command(Run, *Workspace, *SandboxPolicy, SandboxPaths) (*exec.Cmd, error) {
	return nil, nil
}
func (callAdapter) LaunchInfo(Run, *Workspace, *SandboxPolicy) Launch { return Launch{} }
func (c callAdapter) Normalize(string, time.Time) []Event             { return c.events }
func (c callAdapter) TurnEnd(string) (bool, bool)                     { return c.ended, c.failed }
func (callAdapter) SandboxRequired() bool                             { return false }
func (callAdapter) PrepareRun(*Workspace, string, string) (bool, []Event) {
	return false, nil
}
func (callAdapter) UsesVerifiedLaunch() bool { return false }
func (callAdapter) ExtraHostNeeds() []HostNeed {
	return nil
}
func (callAdapter) DisplayName() string { return "call" }
func (callAdapter) PreflightCLI(context.Context, CommandRunner, func(context.Context) (string, error)) error {
	return nil
}
func (callAdapter) CheckManagedConfig([]string) error { return nil }
func (callAdapter) StagesArtifact() bool              { return false }
func (callAdapter) CopyOutputs(*Workspace) error      { return nil }

func TestAdapterLaunchMatchesCommand(t *testing.T) {
	root, p := prepareGoldenRoot(t)
	withGoldenEnv(t, func() {
		for _, c := range launchCases {
			t.Run(c.id, func(t *testing.T) {
				viaCommand := captureLaunch(t, root, p, c)
				a, ok := AdapterFor(c.runtime)
				if !ok {
					t.Fatal(c.runtime)
				}
				dir := filepath.Join(root, "ws-"+c.id)
				ws := &Workspace{Dir: dir, Inputs: filepath.Join(dir, "inputs"), Out: filepath.Join(dir, "out")}
				run := testRun("run-"+c.id, c.role)
				run.Runtime = RuntimeRef{Kind: "subscription", Provider: c.runtime, Model: c.model}
				at := SandboxPaths{
					Home:       filepath.Join(root, "home"),
					DaemonHome: filepath.Join(root, "home", ".controlrod"),
					Workspace:  ws.Dir,
				}
				cmd, err := a.Command(run, ws, p, at)
				if err != nil || cmd == nil {
					t.Fatalf("adapter Command: %v", err)
				}
				if !slices.Equal(cmd.Args, viaCommand.Argv) || !slices.Equal(cmd.Env, viaCommand.Env) || cmd.Dir != viaCommand.Dir {
					t.Fatalf("adapter launch bytes differ from Command")
				}
				if !reflect.DeepEqual(a.LaunchInfo(run, ws, p), viaCommand.Launch) {
					t.Fatalf("adapter LaunchInfo differs from LaunchFor")
				}
			})
		}
	})
}
