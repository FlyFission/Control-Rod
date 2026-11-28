//go:build unix

package runner

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"
)

// runtimeNamePattern matches a switch or comparison on a runtime name. Declarations
// (const RuntimeClaude = "claude", return RuntimeClaude) are not matches. Comments are skipped
// by the scan. No line under daemon/ is on an allowlist.
var runtimeNamePattern = regexp.MustCompile(`case\s+Runtime(Claude|Codex|Fake)\b|switch\s+runtime\b|switch\s+rt\b|==\s*(runner\.)?Runtime(Claude|Codex|Fake)\b|!=\s*(runner\.)?Runtime(Claude|Codex|Fake)\b`)

func TestRegistry(t *testing.T) {
	regs := RegisteredAdapters()
	wantOrder := []string{RuntimeClaude, RuntimeCodex, RuntimeGrok, RuntimeOpenCode, RuntimeAgy, RuntimeOllama, RuntimeFake, RuntimePractice, RuntimePracticeCheck}
	if len(regs) != len(wantOrder) {
		t.Fatalf("registry %d", len(regs))
	}
	seen := map[string]bool{}
	var ids []string
	for _, a := range regs {
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
	if _, ok := AdapterFor("nonexistent-cli"); ok {
		t.Fatal("unregistered id resolved")
	}

	missing := func(string) (string, error) { return "", errors.New("missing") }
	found := func(name string) (string, error) {
		if name == "claude" || name == "codex" {
			return "/bin/" + name, nil
		}
		return "", errors.New("missing")
	}
	// The practice runtimes need nothing installed and are offered unless CONTROLROD_PRACTICE=0.
	off := func(k string) string {
		if k == "CONTROLROD_PRACTICE" {
			return "0"
		}
		return ""
	}
	on := func(k string) string {
		switch k {
		case "CONTROLROD_ALLOW_FAKE":
			return "1"
		case "CONTROLROD_PRACTICE":
			return "0"
		}
		return ""
	}
	practice := []string{RuntimePractice, RuntimePracticeCheck}
	if got := Detect(missing, off); len(got) != 0 {
		t.Fatalf("detect with nothing: %v", got)
	}
	if got := Detect(missing, func(string) string { return "" }); !slices.Equal(got, practice) {
		t.Fatalf("practice is offered with nothing installed: %v", got)
	}
	if got := Detect(found, off); !slices.Equal(got, []string{RuntimeClaude, RuntimeCodex}) {
		t.Fatalf("detect without fake: %v", got)
	}
	if got := Detect(found, func(string) string { return "" }); !slices.Equal(got, append([]string{RuntimeClaude, RuntimeCodex}, practice...)) {
		t.Fatalf("detect with practice, without fake: %v", got)
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
		{"fake", RuntimeFake}, {"practice", RuntimePractice}, {"practice-check", RuntimePracticeCheck}, {"nope", ""}, {"", ""},
	} {
		if got := RuntimeFor(c.provider); got != c.runtime {
			t.Errorf("RuntimeFor %q = %q, want %q", c.provider, got, c.runtime)
		}
	}
}

func TestStreamGolden(t *testing.T) {
	now := time.Date(2026, 10, 31, 12, 0, 0, 0, time.UTC)
	for _, c := range []struct {
		stream string
		id     string
	}{
		{"claude-stream.jsonl", RuntimeClaude},
		{"codex-stream.jsonl", RuntimeCodex},
	} {
		t.Run(c.id, func(t *testing.T) {
			a, ok := AdapterFor(c.id)
			if !ok {
				t.Fatal(c.id)
			}
			got := streamCapture(t, a, filepath.Join("testdata", c.stream), now)
			raw := mustJSON(t, got)
			path := filepath.Join("testdata", "stream-golden", c.id+".json")
			want, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("read golden: %v", err)
			}
			if string(want) != string(raw) {
				t.Fatalf("stream bytes differ from %s\n got %s\nwant %s", path, raw, want)
			}
		})
	}
}

type streamLine struct {
	Line   string  `json:"line"`
	Ended  bool    `json:"ended"`
	Failed bool    `json:"failed"`
	Events []Event `json:"events"`
}

func streamCapture(t *testing.T, a Adapter, path string, now time.Time) []streamLine {
	t.Helper()
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	var out []streamLine
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := sc.Text()
		if strings.TrimSpace(line) == "" {
			continue
		}
		events := a.Normalize(line, now)
		if events == nil {
			events = []Event{}
		}
		ended, failed := a.TurnEnd(line)
		out = append(out, streamLine{Line: line, Ended: ended, Failed: failed, Events: events})
	}
	if err := sc.Err(); err != nil {
		t.Fatal(err)
	}
	if len(out) == 0 {
		t.Fatal("no lines")
	}
	return out
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	return append(b, '\n')
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

func TestExtraEnvDropsProviderProvenance(t *testing.T) {
	in := []string{
		"CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1",
		"ANTHROPIC_BASE_URL=https://example.invalid",
		"ANTHROPIC_MODEL=claude-x",
		"MODEL=hidden",
		"CLAUDE_CODE_OAUTH_TOKEN=oauth",
		"OPENAI_API_KEY=sk",
		"SAFE_FLAG=1",
	}
	got := filterExtraEnv(in)
	want := []string{"CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1", "SAFE_FLAG=1"}
	if !slices.Equal(got, want) {
		t.Fatalf("extra env\n got %q\nwant %q", got, want)
	}
}

func TestHostNeedsForFakeKeepsBubblewrapOnLinux(t *testing.T) {
	if runtime.GOOS != "linux" {
		t.Skip("the shared host list is empty off Linux")
	}
	got := HostNeeds(RuntimeFake)
	if len(got) != 1 || got[0].Program != "bwrap" {
		t.Fatalf("fake host needs %+v", got)
	}
}

func TestMissingOutputCopierIsAnError(t *testing.T) {
	err := copyRunOutputs(context.Background(), callAdapter{}, Run{}, &Workspace{}, &logBuffer{})
	if err == nil || !strings.Contains(err.Error(), "no output copier") {
		t.Fatalf("got %v", err)
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
	if LabelFor(line) != "" || ReportedModel(line) != "" {
		t.Fatal("the fixture line must carry no shared label or model")
	}
	adapt := callAdapter{
		events: []Event{{Kind: EvNotice, Text: "from-adapter"}},
		ended:  true,
		failed: true,
		label:  "StubLabel",
		model:  "stub-model-not-in-json",
	}
	buf := &logBuffer{adapt: adapt}
	buf.add(line)
	if !buf.turnOver || !buf.turnFailed {
		t.Fatal("ingestion did not use the adapter's TurnEnd")
	}
	if len(buf.events) != 1 || buf.events[0].Text != "from-adapter" {
		t.Fatalf("ingestion events %+v", buf.events)
	}
	if buf.label != adapt.label || buf.model != adapt.model {
		t.Fatalf("ingestion metadata label %q model %q", buf.label, buf.model)
	}
}

// callAdapter is a stream parser installed on a log buffer to prove ingestion calls it.
type callAdapter struct {
	events []Event
	ended  bool
	failed bool
	label  string
	model  string
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
func (callAdapter) Probe(context.Context, string, CommandRunner) RuntimeStatus {
	return RuntimeStatus{}
}
func (callAdapter) Command(Run, *Workspace, *SandboxPolicy, SandboxPaths) (*exec.Cmd, error) {
	return nil, nil
}
func (callAdapter) LaunchInfo(Run, *Workspace, *SandboxPolicy) Launch { return Launch{} }
func (c callAdapter) Normalize(string, time.Time) []Event             { return c.events }
func (c callAdapter) TurnEnd(string) (bool, bool)                     { return c.ended, c.failed }
func (c callAdapter) StreamLabel(string) string                       { return c.label }
func (c callAdapter) StreamModel(string) string                       { return c.model }
func (callAdapter) SandboxRequired() bool                             { return false }
func (callAdapter) DisplayName() string                               { return "call" }

func TestSandboxedAdaptersRefuseNilPolicyAndUseAgentEnv(t *testing.T) {
	sawFake := false
	for _, a := range RegisteredAdapters() {
		if !a.SandboxRequired() {
			switch {
			case a.ID() == RuntimeFake:
				sawFake = true
			case IsPractice(a.ID()):
				// The practice runtimes take no sandbox because they start no process at all.
				for _, role := range a.Capabilities().Roles {
					cmd, err := Command(a.ID(), testRun("gate-"+a.ID(), role), workspaceWithTools(t, ""), nil, SandboxPaths{})
					if cmd != nil || err != nil {
						t.Fatalf("%s %s built a process: %v %v", a.ID(), role, cmd, err)
					}
				}
			default:
				t.Fatalf("%s reports no sandbox; only %s and the practice runtimes may", a.ID(), RuntimeFake)
			}
			continue
		}
		ws := workspaceWithTools(t, "")
		run := testRun("gate-"+a.ID(), "author")
		if _, err := Command(a.ID(), run, ws, nil, testPaths(ws)); !errors.Is(err, ErrNoPolicy) {
			t.Fatalf("%s nil policy: %v", a.ID(), err)
		}
		if _, waiting := a.(AwaitingConfinement); waiting {
			continue // refused even with a policy; TestAwaitingConfinementIsRefused covers it
		}
		cmd, err := Command(a.ID(), run, ws, testPolicy(), testPaths(ws))
		if err != nil || cmd == nil {
			t.Fatalf("%s command: %v", a.ID(), err)
		}
		want := AgentEnv(os.Environ())
		if extra, ok := a.(ExtraEnvProvider); ok {
			want = withEnv(append([]string{}, want...), extra.ExtraEnv()...)
		}
		if !slices.Equal(cmd.Env, want) {
			t.Fatalf("%s env\n got %q\nwant %q", a.ID(), cmd.Env, want)
		}
	}
	if !sawFake {
		t.Fatal("registry has no fake runtime")
	}
}

func TestProviderAndIDUnique(t *testing.T) {
	ids := map[string]bool{}
	providers := map[string]string{}
	for _, a := range RegisteredAdapters() {
		if ids[a.ID()] {
			t.Fatalf("duplicate id %s", a.ID())
		}
		ids[a.ID()] = true
		for _, p := range a.Providers() {
			if p != strings.ToLower(p) || p == "" {
				t.Fatalf("%s provider %q is not a lower-case name", a.ID(), p)
			}
			if prev, ok := providers[p]; ok {
				t.Fatalf("provider %q claimed by %s and %s", p, prev, a.ID())
			}
			providers[p] = a.ID()
		}
	}
}

func TestNoRuntimeNameSwitch(t *testing.T) {
	root := filepath.Join("..", "..")
	var hits []string
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") || strings.Contains(path, "testdata") {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for i, line := range strings.Split(string(b), "\n") {
			trim := strings.TrimSpace(line)
			if strings.HasPrefix(trim, "//") {
				continue
			}
			if runtimeNamePattern.MatchString(line) {
				hits = append(hits, fmt.Sprintf("%s:%d: %s", path, i+1, trim))
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(hits) > 0 {
		t.Fatalf("runtime-name dispatch:\n%s", strings.Join(hits, "\n"))
	}
}

// The CLIs Control Rod cannot yet confine are listed but refused before any launch: by the host
// preflight (so they show as not ready, with the gap as the reason) and by Command itself.
func TestAwaitingConfinementIsRefused(t *testing.T) {
	look := func(string) (string, error) { return "/usr/bin/x", nil }
	awaiting := []string{RuntimeOpenCode, RuntimeOllama}
	if runtime.GOOS != "darwin" {
		// Antigravity's sandbox and Grok's bridge are measured on macOS only (change records
		// agy-seat and grok-seat).
		awaiting = append(awaiting, RuntimeAgy, RuntimeGrok)
	}
	for _, id := range awaiting {
		a, ok := AdapterFor(id)
		if !ok {
			t.Fatalf("%s not registered", id)
		}
		if _, ok := a.(AwaitingConfinement); !ok {
			t.Fatalf("%s is not marked as awaiting confinement", id)
		}
		if a.Capabilities().NativeSandbox != "none" && id != RuntimeAgy {
			t.Fatalf("%s claims a sandbox it does not have: %q", id, a.Capabilities().NativeSandbox)
		}
		err := PreflightHost(id, look, nil)
		var pe *PreflightError
		if !errors.As(err, &pe) || !strings.Contains(pe.Reason, "cannot run work yet") {
			t.Fatalf("%s preflight: %v", id, err)
		}
		// A verified policy is not enough: Command refuses the runtime for its confinement gap.
		ws := workspaceWithTools(t, "")
		cmd, err := Command(id, Run{Role: "author"}, ws, testPolicy(), testPaths(ws))
		if !errors.As(err, &pe) || !strings.Contains(pe.Reason, "cannot run work yet") || cmd != nil {
			t.Fatalf("%s Command started without confinement: %v", id, err)
		}
	}
	for _, id := range []string{RuntimeClaude, RuntimeCodex, RuntimeFake} {
		a, _ := AdapterFor(id)
		if _, ok := a.(AwaitingConfinement); ok {
			t.Fatalf("%s is wrongly marked as awaiting confinement", id)
		}
	}
}
