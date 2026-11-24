//go:build unix

package runner

import (
	"context"
	"errors"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestOmpAdapterRegistrationAndCapabilities(t *testing.T) {
	a, ok := AdapterFor(RuntimeOmp)
	if !ok {
		t.Fatal("omp adapter not registered")
	}
	if a.ID() != "omp" {
		t.Fatalf("ID = %q, want omp", a.ID())
	}
	if a.Binary() != "omp" {
		t.Fatalf("Binary = %q, want omp", a.Binary())
	}
	if a.DisplayName() != "Oh My Pi" {
		t.Fatalf("DisplayName = %q, want Oh My Pi", a.DisplayName())
	}
	if !a.SandboxRequired() {
		t.Fatal("SandboxRequired must be true")
	}
	if !slices.Equal(a.Providers(), []string{"omp", "oh-my-pi"}) {
		t.Fatalf("Providers = %v", a.Providers())
	}
	for _, p := range []string{"omp", "OMP", "oh-my-pi", "Oh-My-Pi"} {
		if got := RuntimeFor(p); got != RuntimeOmp {
			t.Errorf("RuntimeFor(%q) = %q, want %q", p, got, RuntimeOmp)
		}
	}

	caps := a.Capabilities()
	if !slices.Equal(caps.Roles, []string{"author", "pre-check"}) {
		t.Fatalf("Roles = %v", caps.Roles)
	}
	if caps.OutputFormat != "json" {
		t.Fatalf("OutputFormat = %q, want json", caps.OutputFormat)
	}
	if caps.ToolAllowlist {
		t.Fatal("ToolAllowlist must be false because omp --tools is not a security boundary")
	}
	if caps.NativeSandbox != "none" {
		t.Fatalf("NativeSandbox = %q, want none", caps.NativeSandbox)
	}
	if caps.NetworkHostLimit {
		t.Fatal("NetworkHostLimit must be false")
	}
	if !caps.MultiVendor {
		t.Fatal("MultiVendor must be true")
	}
	if !slices.Contains(caps.ConfigIsolation, "--no-session") || !slices.Contains(caps.ConfigIsolation, "PI_CODING_AGENT_DIR") {
		t.Fatalf("ConfigIsolation = %v", caps.ConfigIsolation)
	}

	// LaunchInfo records runtime mode, requested model, and sandbox label.
	ws := workspaceWithTools(t, "")
	p := testPolicy()
	launch := LaunchFor(RuntimeOmp, Run{Runtime: RuntimeRef{Model: "anthropic/claude-sonnet-4-6"}}, ws, p)
	if launch.Mode != "print" || launch.RequestedModel != "anthropic/claude-sonnet-4-6" || launch.Sandbox == "none" {
		t.Fatalf("LaunchInfo = %+v", launch)
	}
}

func TestOmpAwaitingConfinementRefusal(t *testing.T) {
	a, ok := AdapterFor(RuntimeOmp)
	if !ok {
		t.Fatal("omp adapter not registered")
	}
	waiter, ok := a.(AwaitingConfinement)
	if !ok {
		t.Fatal("omp must implement AwaitingConfinement")
	}
	gap := waiter.ConfinementGap()
	if !strings.Contains(gap, "ADR 0021") || !strings.Contains(gap, "--tools") {
		t.Fatalf("ConfinementGap should explain ADR 0021 and --tools boundary: %q", gap)
	}

	look := func(string) (string, error) { return "/usr/local/bin/omp", nil }
	err := PreflightHost(RuntimeOmp, look, nil)
	var pe *PreflightError
	if !errors.As(err, &pe) || !strings.Contains(pe.Reason, "cannot run work yet") {
		t.Fatalf("PreflightHost = %v, want PreflightError refusal", err)
	}

	ws := workspaceWithTools(t, "")
	run := testRun("run-omp-refuse", "author")
	if _, err := Command(RuntimeOmp, run, ws, nil, testPaths(ws)); !errors.Is(err, ErrNoPolicy) {
		t.Fatalf("Command(nil policy) = %v, want ErrNoPolicy", err)
	}
	if cmd, err := Command(RuntimeOmp, run, ws, testPolicy(), testPaths(ws)); !errors.As(err, &pe) || cmd != nil {
		t.Fatalf("Command(with policy) = (%v, %v), want confinement refusal", cmd, err)
	}
	// Direct adapter.Command also refuses while AwaitingConfinement is implemented.
	if cmd, err := (ompAdapter{}).Command(run, ws, testPolicy(), testPaths(ws)); !errors.As(err, &pe) || cmd != nil {
		t.Fatalf("ompAdapter.Command = (%v, %v), want confinement refusal", cmd, err)
	}
}

func TestOmpAvailableAndProbe(t *testing.T) {
	a := ompAdapter{}
	found := func(name string) (string, error) {
		if name == "omp" {
			return "/usr/local/bin/omp", nil
		}
		return "", errors.New("not found")
	}
	missing := func(string) (string, error) { return "", errors.New("not found") }
	if !a.Available(found, nil) {
		t.Fatal("Available should be true when omp is on PATH")
	}
	if a.Available(missing, nil) {
		t.Fatal("Available should be false when omp is missing")
	}

	t.Run("missing binary", func(t *testing.T) {
		old := resolveArtifact
		resolveArtifact = func(string) (RuntimeArtifact, error) {
			return RuntimeArtifact{}, errors.New("omp not on PATH")
		}
		t.Cleanup(func() { resolveArtifact = old })

		st := Probe(context.Background(), RuntimeOmp, "", answers(map[string]ans{}).run)
		if st.Runtime != RuntimeOmp || st.Ready || !strings.Contains(st.Reason, "cannot be found") {
			t.Fatalf("missing probe = %+v", st)
		}
	})

	t.Run("installed version parsed", func(t *testing.T) {
		stubArtifact(t)
		s := answers(map[string]ans{"omp --version": {"omp 0.42.1\n", 0}})
		st := Probe(context.Background(), RuntimeOmp, "", s.run)
		if !st.Ready || st.Runtime != RuntimeOmp || st.Version != "omp 0.42.1" {
			t.Fatalf("installed probe = %+v", st)
		}
	})

	t.Run("version command fails", func(t *testing.T) {
		stubArtifact(t)
		s := answers(map[string]ans{"omp --version": {"boom", 1}})
		st := Probe(context.Background(), RuntimeOmp, "", s.run)
		if st.Ready || !strings.Contains(st.Reason, "did not answer") {
			t.Fatalf("failed probe = %+v", st)
		}
	})
}

func TestOmpArgsAndIsolatedEnv(t *testing.T) {
	ws := workspaceWithTools(t, "")

	t.Run("author with explicit model and thinking", func(t *testing.T) {
		run := Run{Role: "author", Runtime: RuntimeRef{Model: "anthropic/claude-sonnet-4-6"}}
		got := OmpArgs(run, ws, "high")
		want := []string{
			"--print", "--mode", "json", "--no-session",
			"--model", "anthropic/claude-sonnet-4-6",
			"--thinking", "high",
			Prompt,
		}
		if !slices.Equal(got, want) {
			t.Fatalf("OmpArgs\n got %q\nwant %q", got, want)
		}
	})

	t.Run("inline effort suffix split without breaking ollama tags", func(t *testing.T) {
		runEffort := Run{Role: "author", Runtime: RuntimeRef{Model: "openai/gpt-5-codex:medium"}}
		gotEffort := OmpArgs(runEffort, ws, "")
		wantEffort := []string{
			"--print", "--mode", "json", "--no-session",
			"--model", "openai/gpt-5-codex",
			"--thinking", "medium",
			Prompt,
		}
		if !slices.Equal(gotEffort, wantEffort) {
			t.Fatalf("inline effort\n got %q\nwant %q", gotEffort, wantEffort)
		}

		runOllama := Run{Role: "author", Runtime: RuntimeRef{Model: "ollama/qwen2.5-coder:32b"}}
		gotOllama := OmpArgs(runOllama, ws, "")
		wantOllama := []string{
			"--print", "--mode", "json", "--no-session",
			"--model", "ollama/qwen2.5-coder:32b",
			Prompt,
		}
		if !slices.Equal(gotOllama, wantOllama) {
			t.Fatalf("ollama tag\n got %q\nwant %q", gotOllama, wantOllama)
		}
	})

	t.Run("default model omits --model and pre-check uses CheckerPrompt", func(t *testing.T) {
		run := Run{Role: "pre-check", Runtime: RuntimeRef{Model: "default"}}
		got := OmpArgs(run, ws, "default")
		want := []string{"--print", "--mode", "json", "--no-session", CheckerPrompt}
		if !slices.Equal(got, want) {
			t.Fatalf("pre-check args\n got %q\nwant %q", got, want)
		}
	})

	t.Run("isolated PI_CODING_AGENT_DIR inside workspace", func(t *testing.T) {
		dir := OmpConfigDir(ws)
		if !strings.HasPrefix(dir, ws.Dir) || strings.Contains(dir, ".omp/") {
			t.Fatalf("OmpConfigDir = %q, must be inside workspace %q", dir, ws.Dir)
		}
		if dir != filepath.Join(ws.Dir, ".omp-agent") {
			t.Fatalf("OmpConfigDir(no scratch) = %q, want %q", dir, filepath.Join(ws.Dir, ".omp-agent"))
		}

		wsWithScratch := &Workspace{Dir: ws.Dir, Scratch: filepath.Join(ws.Dir, "scratch")}
		scratchDir := OmpConfigDir(wsWithScratch)
		if scratchDir != filepath.Join(wsWithScratch.Scratch, "omp-agent") {
			t.Fatalf("OmpConfigDir(with scratch) = %q, want under scratch", scratchDir)
		}

		env := OmpIsolatedEnv(wsWithScratch)
		if !slices.Contains(env, "PI_CODING_AGENT_DIR="+scratchDir) {
			t.Fatalf("OmpIsolatedEnv missing PI_CODING_AGENT_DIR: %v", env)
		}
		if !slices.Contains(env, "OMP_DISABLE_SUBAGENTS=1") || !slices.Contains(env, "OMP_DISABLE_ADVISOR=1") {
			t.Fatalf("OmpIsolatedEnv missing subagent/advisor disable flags: %v", env)
		}
		// Ensure none of the isolated env keys are dropped by filterExtraEnv.
		if filtered := filterExtraEnv(env); !slices.Equal(filtered, env) {
			t.Fatalf("filterExtraEnv dropped isolated env keys: got %v want %v", filtered, env)
		}
	})
}

func TestOmpNormalizeAndTurnEnd(t *testing.T) {
	a := ompAdapter{}
	now := time.Date(2026, 11, 24, 15, 0, 0, 0, time.UTC)

	t.Run("non-JSON and unrecognized lines are ignored safely", func(t *testing.T) {
		for _, line := range []string{"", "plain stdout", "{broken json", `{"type":"unknown_event"}`} {
			if evs := a.Normalize(line, now); len(evs) != 0 {
				t.Errorf("Normalize(%q) = %+v, want empty", line, evs)
			}
			if ended, failed := a.TurnEnd(line); ended || failed {
				t.Errorf("TurnEnd(%q) = (%v,%v), want (false,false)", line, ended, failed)
			}
		}
	})

	t.Run("message_update delta emits message event", func(t *testing.T) {
		line := `{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Checking inputs/BRIEF.md"}}`
		evs := a.Normalize(line, now)
		if len(evs) != 1 || evs[0].Kind != EvMessage || evs[0].Text != "Checking inputs/BRIEF.md" {
			t.Fatalf("got %+v", evs)
		}
	})

	t.Run("tool_execution_start and tool_execution_end", func(t *testing.T) {
		startLine := `{"type":"tool_execution_start","toolCallId":"call_1","toolName":"read","args":{"path":"inputs/BRIEF.md"}}`
		evs := a.Normalize(startLine, now)
		if len(evs) != 1 || evs[0].Kind != EvToolStart || evs[0].Tool != "read" || evs[0].Summary != "Read: BRIEF.md" || evs[0].CallID != "call_1" || evs[0].InputDigest == "" {
			t.Fatalf("tool_start = %+v", evs)
		}
		if lbl := a.StreamLabel(startLine); lbl != "Read: BRIEF.md" {
			t.Fatalf("StreamLabel = %q, want Read: BRIEF.md", lbl)
		}

		okLine := `{"type":"tool_execution_end","toolCallId":"call_1","toolName":"read","isError":false}`
		evs = a.Normalize(okLine, now)
		if len(evs) != 1 || evs[0].Kind != EvToolEnd || evs[0].OK == nil || !*evs[0].OK {
			t.Fatalf("tool_end ok = %+v", evs)
		}

		errLine := `{"type":"tool_execution_end","toolCallId":"call_2","toolName":"bash","isError":true,"error":"permission denied"}`
		evs = a.Normalize(errLine, now)
		if len(evs) != 1 || evs[0].Kind != EvToolEnd || evs[0].OK == nil || *evs[0].OK || evs[0].Text != "permission denied" {
			t.Fatalf("tool_end err = %+v", evs)
		}
	})

	t.Run("usage preserves reported counts and keeps omitted fields nil", func(t *testing.T) {
		line := `{"type":"message_end","message":{"role":"assistant","provider":"anthropic","model":"claude-sonnet-4-6","content":[{"type":"text","text":"Done."}],"usage":{"input":120,"output":45}}}`
		evs := a.Normalize(line, now)
		if len(evs) != 2 {
			t.Fatalf("got %d events: %+v", len(evs), evs)
		}
		if evs[0].Kind != EvMessage || evs[0].Text != "Done." {
			t.Fatalf("ev[0] = %+v", evs[0])
		}
		u := evs[1]
		if u.Kind != EvUsage || u.InputTokens == nil || *u.InputTokens != 120 || u.OutputTokens == nil || *u.OutputTokens != 45 || u.CachedTokens != nil {
			t.Fatalf("usage = %+v, want input=120 output=45 cached=nil", u)
		}
	})

	t.Run("turn_end success and failure", func(t *testing.T) {
		okLine := `{"type":"turn_end","status":"completed","usage":{"input_tokens":50,"output_tokens":10,"cache_read_input_tokens":0}}`
		ended, failed := a.TurnEnd(okLine)
		if !ended || failed {
			t.Fatalf("TurnEnd(ok) = (%v,%v), want (true,false)", ended, failed)
		}
		if lbl := a.StreamLabel(okLine); lbl != "Finishing" {
			t.Fatalf("StreamLabel(turn_end) = %q, want Finishing", lbl)
		}
		evs := a.Normalize(okLine, now)
		if len(evs) != 1 || evs[0].Kind != EvUsage || evs[0].CachedTokens == nil || *evs[0].CachedTokens != 0 {
			t.Fatalf("turn_end usage = %+v, want explicit 0 preserved", evs)
		}

		failLine := `{"type":"turn_end","isError":true,"error":"rate limit exceeded"}`
		ended, failed = a.TurnEnd(failLine)
		if !ended || !failed {
			t.Fatalf("TurnEnd(fail) = (%v,%v), want (true,true)", ended, failed)
		}
		evs = a.Normalize(failLine, now)
		if len(evs) != 1 || evs[0].Kind != EvError || evs[0].Text != "rate limit exceeded" {
			t.Fatalf("turn_end error = %+v", evs)
		}

		errLine := `{"type":"error","message":"provider unavailable"}`
		ended, failed = a.TurnEnd(errLine)
		if !ended || !failed {
			t.Fatalf("TurnEnd(error) = (%v,%v), want (true,true)", ended, failed)
		}
		evs = a.Normalize(errLine, now)
		if len(evs) != 1 || evs[0].Kind != EvError || evs[0].Text != "provider unavailable" {
			t.Fatalf("error event = %+v", evs)
		}
	})
}

func TestOmpStreamModelAndVendorFamily(t *testing.T) {
	a := ompAdapter{}

	modelCases := []struct {
		name string
		line string
		want string
	}{
		{
			name: "combined provider/model at top level",
			line: `{"type":"turn_start","model":"anthropic/claude-sonnet-4-6"}`,
			want: "anthropic/claude-sonnet-4-6",
		},
		{
			name: "separate provider and model under message",
			line: `{"type":"message_end","message":{"provider":"openai-codex","model":"gpt-5-codex"}}`,
			want: "openai-codex/gpt-5-codex",
		},
		{
			name: "nested model object",
			line: `{"type":"session","model":{"provider":"google","id":"gemini-2.5-pro"}}`,
			want: "google/gemini-2.5-pro",
		},
		{
			name: "ollama model with tag",
			line: `{"type":"turn_start","provider":"ollama","model":"qwen2.5-coder:32b"}`,
			want: "ollama/qwen2.5-coder:32b",
		},
		{
			name: "non-json returns empty",
			line: `not json`,
			want: "",
		},
		{
			name: "missing type returns empty",
			line: `{"model":"anthropic/claude-sonnet-4-6"}`,
			want: "",
		},
	}
	for _, tc := range modelCases {
		t.Run(tc.name, func(t *testing.T) {
			if got := a.StreamModel(tc.line); got != tc.want {
				t.Fatalf("StreamModel = %q, want %q", got, tc.want)
			}
		})
	}

	// Verify logBuffer records observed_models via StreamMetadataParser.
	buf := &logBuffer{adapt: a}
	buf.add(`{"type":"message_end","message":{"provider":"anthropic","model":"claude-sonnet-4-6"}}`)
	buf.add(`{"type":"message_end","message":{"provider":"xai","model":"grok-4"}}`)
	if !slices.Equal(buf.observedModels(), []string{"anthropic/claude-sonnet-4-6", "xai/grok-4"}) {
		t.Fatalf("observedModels = %v", buf.observedModels())
	}

	familyCases := []struct {
		model string
		want  string
	}{
		{"anthropic/claude-sonnet-4-6", "anthropic"},
		{"claude/claude-opus-4-6", "anthropic"},
		{"claude-sonnet-4-6", "anthropic"},
		{"openai/gpt-5-codex", "openai"},
		{"openai-codex/gpt-5-codex", "openai"},
		{"gpt-5", "openai"},
		{"o3-mini", "openai"},
		{"xai/grok-4", "xai"},
		{"grok-4", "xai"},
		{"google/gemini-2.5-pro", "google"},
		{"gemini-2.5-flash", "google"},
		{"deepseek/deepseek-r1", "deepseek"},
		{"deepseek-chat", "deepseek"},
		{"mistral/devstral-small", "mistral"},
		{"codestral-latest", "mistral"},
		{"ollama/qwen2.5-coder:32b", "local"},
		{"lm-studio/llama-3.3-70b", "local"},
		{"llama.cpp/qwen3-32b", "local"},
		// Fail-closed cases: empty, malformed, or unknown providers must return "".
		{"", ""},
		{"   ", ""},
		{"anthropic/", ""},
		{"openrouter/some-model", ""},
		{"unknown-vendor/custom-model", ""},
		{"custom-unmapped-model", ""},
	}
	for _, tc := range familyCases {
		if got := OmpVendorFamily(tc.model); got != tc.want {
			t.Errorf("OmpVendorFamily(%q) = %q, want %q", tc.model, got, tc.want)
		}
	}
}
