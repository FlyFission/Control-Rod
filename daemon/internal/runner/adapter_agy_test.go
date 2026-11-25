package runner

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"
)

func agySettingsFor(t *testing.T, ws *Workspace) (allow, deny []string) {
	t.Helper()
	raw, err := AgySettings(ws, testPolicy(), testPaths(ws))
	if err != nil {
		t.Fatal(err)
	}
	var v struct {
		Permissions struct {
			Allow []string `json:"allow"`
			Deny  []string `json:"deny"`
		} `json:"permissions"`
	}
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		t.Fatalf("settings are not JSON: %v\n%s", err, raw)
	}
	return v.Permissions.Allow, v.Permissions.Deny
}

// Every entry beside the path to the workspace is denied by name, and nothing on the path is,
// because a deny on a folder that holds the workspace would close the workspace too.
func TestAgyOutsideDeniesNameEverySiblingOnThePath(t *testing.T) {
	root := t.TempDir()
	ws := filepath.Join(root, "a", "b", "ws")
	for _, d := range []string{ws, filepath.Join(root, "a", "other"), filepath.Join(root, "a", "b", "peer")} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.WriteFile(filepath.Join(root, "loose.txt"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	real, err := canonicalPath(ws)
	if err != nil {
		t.Fatal(err)
	}
	got, err := agyOutsideDenies(real)
	if err != nil {
		t.Fatal(err)
	}
	croot, _ := canonicalPath(root)
	for _, want := range []string{filepath.Join(croot, "loose.txt"), filepath.Join(croot, "a", "other"), filepath.Join(croot, "a", "b", "peer")} {
		if !slices.Contains(got, want) {
			t.Fatalf("%s is not denied: %v", want, got)
		}
	}
	for _, g := range got {
		if within(real, g) {
			t.Fatalf("%s holds the workspace and must not be denied", g)
		}
	}
	// Every top-level entry other than the first path component is named.
	top, _ := os.ReadDir("/")
	first := strings.Split(strings.TrimPrefix(real, "/"), "/")[0]
	for _, e := range top {
		p := "/" + e.Name()
		if e.Name() != first && !slices.Contains(agySystemPaths, p) && !slices.Contains(got, p) {
			t.Fatalf("%s is not denied", p)
		}
	}
	// System folders stay readable: Antigravity applies these denies to its terminal sandbox, and
	// a denied /bin or /usr stops every command from starting.
	for _, g := range got {
		if slices.Contains(agySystemPaths, g) {
			t.Fatalf("system folder %s is denied", g)
		}
	}
	for _, home := range []string{"/Users", "/home", "/Volumes", "/private/var/folders", "/private/var/root"} {
		if slices.Contains(agySystemPaths, home) {
			t.Fatalf("%s must stay denied", home)
		}
	}
}

func TestAgySettingsFenceTheFileTools(t *testing.T) {
	ws := workspaceWithTools(t, "")
	dir, _ := canonicalPath(ws.Dir)
	allow, deny := agySettingsFor(t, ws)
	if !slices.Equal(allow, []string{"write_file(" + dir + ")", agyAnyCommand}) {
		t.Fatalf("author allow: %v", allow)
	}
	for _, want := range []string{"read_file(/home/u)", "read_file(/home/u/.controlrod)", "read_file(/mnt)",
		"write_file(" + filepath.Join(dir, "inputs") + ")", "command(security)", "command(git push)", "command(curl)", "command(agy)"} {
		if !slices.Contains(deny, want) {
			t.Fatalf("deny is missing %s: %v", want, deny)
		}
	}
	for _, d := range deny {
		p, ok := strings.CutPrefix(d, "read_file(")
		if ok && within(dir, strings.TrimSuffix(p, ")")) {
			t.Fatalf("%s denies the workspace", d)
		}
	}
}

func TestAgyCheckerSettingsWriteScratchOnlyAndRunReadingCommands(t *testing.T) {
	ws := workspaceWithTools(t, "")
	ws.Checker = true
	dir, _ := canonicalPath(ws.Dir)
	allow, deny := agySettingsFor(t, ws)
	args, err := AgyArgs(testRun("r", "pre-check"), ws, testPolicy(), testPaths(ws))
	if err != nil || !argPair(args, "--mode", "plan") || args[1] != CheckerPrompt+agyToolNote {
		t.Fatalf("checker args %v %v", args, err)
	}
	if !slices.Contains(deny, "command(rm)") || !slices.Contains(deny, "command(python3)") {
		t.Fatalf("checker does not deny writing commands: %v", deny)
	}
	if allow[0] != "write_file("+filepath.Join(dir, "scratch")+")" {
		t.Fatalf("checker may write: %v", allow)
	}
	for _, a := range allow {
		if a == agyAnyCommand || a == "write_file("+dir+")" {
			t.Fatalf("checker allow is too wide: %s", a)
		}
	}
	for _, want := range []string{"write_file(" + filepath.Join(dir, "inputs") + ")", "write_file(" + filepath.Join(dir, "out") + ")"} {
		if !slices.Contains(deny, want) {
			t.Fatalf("checker deny is missing %s", want)
		}
	}
}

func TestAgySettingsRefuseAWorkspaceInsideADeniedFolder(t *testing.T) {
	ws := workspaceWithTools(t, "")
	at := testPaths(ws)
	parent, _ := canonicalPath(filepath.Dir(ws.Dir))
	at.Home = parent // the home folder now holds the workspace, as a daemon-home workspace would
	p := testPolicy()
	_, err := AgySettings(ws, p, at)
	var pe *PreflightError
	if !errors.As(err, &pe) || !strings.Contains(pe.Reason, "outside the home folder") {
		t.Fatalf("a workspace in the home folder was fenced: %v", err)
	}
}

func TestAgyArgsAreHeadlessSandboxedAndInline(t *testing.T) {
	ws := workspaceWithTools(t, "")
	run := testRun("run-agy", "author")
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: "agy", Model: "gemini-4-neon-high"}
	args, err := AgyArgs(run, ws, testPolicy(), testPaths(ws))
	if err != nil {
		t.Fatal(err)
	}
	if args[0] != "-p" || args[1] != Prompt+agyToolNote {
		t.Fatalf("the prompt must follow -p: %v", args[:2])
	}
	for _, want := range [][]string{{"--output-format", "stream-json"}, {"--model", "gemini-4-neon-high"}} {
		if !argPair(args, want[0], want[1]) {
			t.Fatalf("missing %v in %v", want, args)
		}
	}
	for _, flag := range []string{"--sandbox", "--disable-slash-commands"} {
		if !slices.Contains(args, flag) {
			t.Fatalf("missing %s", flag)
		}
	}
	i := slices.Index(args, "--settings")
	if i < 0 || !strings.HasPrefix(args[i+1], "{") {
		t.Fatalf("settings must be inline JSON: %v", args)
	}
	// A counted check accepts these arguments: inline settings, no base URL.
	if err := scanArgs(RuntimeAgy, args); err != nil {
		t.Fatalf("counted-check scan refused the launch: %v", err)
	}
	if m, err := argvModel(RuntimeAgy, args); err != nil || m != "gemini-4-neon-high" {
		t.Fatalf("argv model %q %v", m, err)
	}
}

func TestAgyRefusesWhatItCannotConfine(t *testing.T) {
	var pe *PreflightError
	ws := workspaceWithTools(t, "network: on\n")
	if _, err := AgyArgs(testRun("r", "author"), ws, testPolicy(), testPaths(ws)); !errors.As(err, &pe) {
		t.Fatalf("a network role ran: %v", err)
	}
	ws = workspaceWithTools(t, "")
	ws.Checkout = &CheckoutBinding{Path: ws.Dir}
	if _, err := AgyArgs(testRun("r", "author"), ws, testPolicy(), testPaths(ws)); !errors.As(err, &pe) || !strings.Contains(pe.Reason, "checkout") {
		t.Fatalf("a checkout run started: %v", err)
	}
	p := testPolicy()
	p.EnabledTools = []string{"read"}
	ws = workspaceWithTools(t, "")
	if _, err := AgyArgs(testRun("r", "author"), ws, p, testPaths(ws)); err == nil {
		t.Fatal("a policy without commands ran")
	}
}

func TestAgyIsConfinedOnlyOnMacOS(t *testing.T) {
	err := confinementRefusal(agyAdapter{})
	if runtime.GOOS == "darwin" && err != nil {
		t.Fatalf("refused on macOS: %v", err)
	}
	if runtime.GOOS != "darwin" && err == nil {
		t.Fatal("started on a platform its sandbox was not measured on")
	}
	if !selfConfined(agyAdapter{}) || selfConfined(claudeAdapter{}) || selfConfined(codexAdapter{}) {
		t.Fatal("only Antigravity skips the outer checker mount")
	}
}

func TestAgyRunHomeIsEmptyBesideTheWorkspaceAndLinksOnlyTheKeychain(t *testing.T) {
	ws := workspaceWithTools(t, "")
	if err := (agyAdapter{}).PrepareRunHome(ws); err != nil {
		t.Fatal(err)
	}
	dir, _ := canonicalPath(ws.Dir)
	if ws.RunHome != dir+".home" || within(ws.RunHome, dir) {
		t.Fatalf("run home %s must sit beside, not inside, %s", ws.RunHome, dir)
	}
	var names []string
	entries, _ := os.ReadDir(ws.RunHome)
	for _, e := range entries {
		names = append(names, e.Name())
	}
	if !slices.Equal(names, []string{".controlrod-gate.sh", ".controlrod-nobypass.sh", ".gemini", "Library"}) {
		t.Fatalf("run home holds %v", names)
	}
	cfg, _ := os.ReadDir(filepath.Join(ws.RunHome, ".gemini", "config"))
	if len(cfg) != 1 || cfg[0].Name() != "hooks.json" {
		t.Fatalf("the run home's configuration holds more than the gate: %v", cfg)
	}
	var hooks map[string]map[string][]struct {
		Matcher string `json:"matcher"`
		Hooks   []struct {
			Command string `json:"command"`
		} `json:"hooks"`
	}
	raw, _ := os.ReadFile(filepath.Join(ws.RunHome, ".gemini", "config", "hooks.json"))
	if err := json.Unmarshal(raw, &hooks); err != nil {
		t.Fatal(err)
	}
	gate := hooks["controlrod-seat-gate"]["PreToolUse"]
	if len(gate) != 2 || !strings.Contains(gate[0].Matcher, "search_web") || !strings.Contains(gate[0].Matcher, "invoke_subagent") || gate[1].Matcher != "run_command" {
		t.Fatalf("gate %+v", gate)
	}
	c := exec.Command(gate[0].Hooks[0].Command)
	c.Stdin = strings.NewReader(`{"tool_name":"search_web"}`)
	out, err := c.Output()
	var decision struct{ Decision, Reason string }
	if err != nil || json.Unmarshal(out, &decision) != nil || decision.Decision != "deny" || decision.Reason != agyGateReason {
		t.Fatalf("gate printed %q (%v)", out, err)
	}
	real, _ := os.UserHomeDir()
	if l, err := os.Readlink(filepath.Join(ws.RunHome, "Library", "Keychains")); err != nil || l != filepath.Join(real, "Library", "Keychains") {
		t.Fatalf("keychain link %q %v", l, err)
	}
	// The file-tool rules computed afterwards deny the run home by name.
	_, deny := agySettingsFor(t, ws)
	if !slices.Contains(deny, "read_file("+ws.RunHome+")") {
		t.Fatalf("the run home is readable by the file tools: %v", deny)
	}
	// Command starts the CLI with HOME set to it.
	run := testRun("r", "author")
	cmd, err := Command(RuntimeAgy, run, ws, testPolicy(), testPaths(ws))
	if runtime.GOOS != "darwin" {
		if err == nil {
			t.Fatal("started off macOS")
		}
		return
	}
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(cmd.Env, "HOME="+ws.RunHome) {
		t.Fatalf("HOME is not the run home: %v", cmd.Env)
	}
}

func TestAgyStreamNormalizes(t *testing.T) {
	a := agyAdapter{}
	now := time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC)
	if m := a.StreamModel(`{"event":"init","init":{"model":"gemini-4-neon-high","cwd":"/w","tools":["view"],"permission_mode":"default"}}`); m != "gemini-4-neon-high" {
		t.Fatalf("model %q", m)
	}
	start := a.Normalize(`{"event":"step_update","step_update":{"step_index":2,"state":"ACTIVE","step_type":"tool","tool_name":"run_command","tool_info":{"name":"run_command","parameters":{"command":"ls"}}}}`, now)
	if len(start) != 1 || start[0].Kind != EvToolStart || start[0].CallID != "step-2" {
		t.Fatalf("start %+v", start)
	}
	fail := a.Normalize(`{"event":"step_update","step_update":{"step_index":2,"state":"ERROR","step_type":"tool","tool_name":"run_command","tool_info":{"name":"run_command","error":{"type":"denied","message":"permission denied"}}}}`, now)
	if len(fail) != 1 || fail[0].Kind != EvToolEnd || *fail[0].OK || fail[0].Text != "permission denied" {
		t.Fatalf("fail %+v", fail)
	}
	if ev := a.Normalize(`{"event":"step_update","step_update":{"step_index":3,"state":"ACTIVE","step_type":"agent_response","text_delta":"he"}}`, now); ev != nil {
		t.Fatalf("a text delta became events: %+v", ev)
	}
	ok := `{"event":"result","result":{"conversation_id":"c","status":"SUCCESS","response":"ok","num_turns":1,"usage":{"input_tokens":10,"output_tokens":2,"cache_read_tokens":4}}}`
	if ended, failed := a.TurnEnd(ok); !ended || failed {
		t.Fatalf("success: %v %v", ended, failed)
	}
	evs := a.Normalize(ok, now)
	if len(evs) != 2 || evs[0].Text != "ok" || evs[1].Kind != EvUsage || !evs[1].Cumulative || *evs[1].CachedTokens != 4 {
		t.Fatalf("result %+v", evs)
	}
	for _, bad := range []string{
		`{"event":"result","result":{"status":"ERROR","error":"bad model","finished_reason":"error"}}`,
		`{"event":"result","result":{"status":"SUCCESS","finished_reason":"print_timeout"}}`,
	} {
		if ended, failed := a.TurnEnd(bad); !ended || !failed {
			t.Fatalf("%s: %v %v", bad, ended, failed)
		}
	}
	// Claude's and Codex's shapes do not end an Antigravity run.
	if ended, _ := a.TurnEnd(`{"type":"result","subtype":"success"}`); ended {
		t.Fatal("a Claude result ended an Antigravity run")
	}
}

func TestAgyModelsReadsIDsOnly(t *testing.T) {
	got := agyModels("Available models:\n  gemini-4-neon-high  (default)\n- gemini-3.8-flash-low\n\nclaude-opus-5-5-thinking\n")
	if !slices.Equal(got, []string{"gemini-4-neon-high", "gemini-3.8-flash-low", "claude-opus-5-5-thinking"}) {
		t.Fatalf("%v", got)
	}
}

// Lines captured from agy 1.5.16 on macOS (paths shortened; change record agy-seat).
func TestAgyCapturedStream(t *testing.T) {
	a := agyAdapter{}
	now := time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC)
	b, err := os.ReadFile(filepath.Join("testdata", "agy-1.5.16-stream.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	var kinds []string
	var model string
	ended := 0
	for _, line := range strings.Split(strings.TrimSpace(string(b)), "\n") {
		if m := a.StreamModel(line); m != "" {
			model = m
		}
		for _, e := range a.Normalize(line, now) {
			k := e.Kind
			if e.OK != nil && !*e.OK {
				k += ":fail"
			}
			kinds = append(kinds, k)
		}
		if done, failed := a.TurnEnd(line); done {
			ended++
			if failed {
				t.Fatal("a SUCCESS result was read as failed")
			}
		}
	}
	want := []string{EvToolStart, EvToolEnd, EvToolStart, EvToolEnd + ":fail", EvMessage, EvUsage}
	if !slices.Equal(kinds, want) || model != "gemini-3.8-flash-low" || ended != 1 {
		t.Fatalf("kinds %v model %q ended %d", kinds, model, ended)
	}
	bad, err := os.ReadFile(filepath.Join("testdata", "agy-1.5.16-badmodel.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if done, failed := a.TurnEnd(strings.TrimSpace(string(bad))); !done || !failed {
		t.Fatal("a bad model was not a failed turn")
	}
	evs := a.Normalize(strings.TrimSpace(string(bad)), now)
	if len(evs) == 0 || evs[0].Kind != EvError || !strings.Contains(evs[0].Text, "invalid model selection") {
		t.Fatalf("bad model events %+v", evs)
	}
	if l := a.StreamLabel(`{"event":"step_update","step_update":{"step_index":3,"state":"ACTIVE","step_type":"tool","tool_name":"run_command","tool_info":{"name":"run_command","parameters":{"CommandLine":"ls"}}}}`); l == "" {
		t.Fatal("a running command has no label")
	}
}

// A hook file anywhere Antigravity would load it from refuses the launch: in the workspace or in
// any folder above it (measured: such hooks run outside the sandbox when agy starts).
func TestAgyRefusesWorkspaceConfigurationItWouldLoad(t *testing.T) {
	for i, name := range []string{".agents", ".agent", "_agents", "_agent", "GEMINI.md", "AGENTS.md"} {
		for _, where := range []string{"workspace", "parent"} {
			ws := workspaceWithTools(t, "")
			dir := ws.Dir
			if where == "parent" {
				parent := filepath.Join(filepath.Dir(ws.Dir), fmt.Sprintf("p-%d", i))
				if err := os.MkdirAll(parent, 0o700); err != nil {
					t.Fatal(err)
				}
				inner := filepath.Join(parent, "ws")
				if err := os.Rename(ws.Dir, inner); err != nil {
					t.Fatal(err)
				}
				ws.Dir, ws.Inputs, ws.Out = inner, filepath.Join(inner, "inputs"), filepath.Join(inner, "out")
				dir = parent
			}
			if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
				t.Fatal(err)
			}
			_, err := AgyArgs(testRun("r", "author"), ws, testPolicy(), testPaths(ws))
			var pe *PreflightError
			if !errors.As(err, &pe) || !strings.Contains(pe.Reason, "outside the sandbox") {
				t.Fatalf("%s in the %s: %v", name, where, err)
			}
		}
	}
}

// The terminal gate refuses any call that asks to leave the sandbox, whatever the spacing, case or
// value, and an empty input; every other call falls through to the permission rules.
func TestAgyBypassGateRefusesLeavingTheSandbox(t *testing.T) {
	home := t.TempDir()
	if err := writeAgyGate(home); err != nil {
		t.Fatal(err)
	}
	gate := filepath.Join(home, ".controlrod-nobypass.sh")
	decide := func(in string) (string, string) {
		t.Helper()
		c := exec.Command(gate)
		c.Stdin = strings.NewReader(in)
		out, err := c.Output()
		var d struct{ Decision, Reason string }
		if err != nil || json.Unmarshal(out, &d) != nil {
			t.Fatalf("gate printed %q (%v) for %s", out, err, in)
		}
		return d.Decision, d.Reason
	}
	for _, in := range []string{
		`{"toolCall":{"name":"run_command","args":{"CommandLine":"cat x","BypassSandbox":true}}}`,
		"{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"cat x\",\n  \"BypassSandbox\" :\n true}}}",
		`{"toolCall":{"args":{"bypassSandbox":"true"}}}`,
		`{"toolCall":{"args":{"BypassSandbox":1}}}`,
		`{"toolCall":{"args":{"CommandLine":"echo \"BypassSandbox\":false","BypassSandbox":true}}}`,
		``,
	} {
		if d, r := decide(in); d != "deny" || r != agyBypassReason {
			t.Fatalf("%q: %s %s", in, d, r)
		}
	}
	for _, in := range []string{
		`{"toolCall":{"name":"run_command","args":{"CommandLine":"ls"}}}`,
		`{"toolCall":{"name":"run_command","args":{"CommandLine":"ls","BypassSandbox":false}}}`,
		`{"toolCall":{"args":{"CommandLine":"echo \"BypassSandbox\":true","BypassSandbox":false}}}`,
	} {
		if d, _ := decide(in); d != "ask" {
			t.Fatalf("%q: %s", in, d)
		}
	}
}

// Each Antigravity workspace sits in a fresh owner-only folder of its own, so a file the file
// tools create above the workspace is beside this run only.
func TestAgyWorkspaceRootIsFreshPerRun(t *testing.T) {
	a, err := (agyAdapter{}).WorkspaceRoot("")
	if err != nil {
		t.Skipf("no run root here: %v", err)
	}
	defer os.RemoveAll(a)
	b, err := (agyAdapter{}).WorkspaceRoot("")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(b)
	if a == b || filepath.Dir(a) != filepath.Dir(b) {
		t.Fatalf("roots %s and %s", a, b)
	}
	if tmp, _ := canonicalPath("/var/tmp"); filepath.Dir(a) != tmp {
		t.Fatalf("root %s is not directly in /var/tmp: no folder shared between runs may sit on the path", a)
	}
	if st, err := os.Stat(a); err != nil || st.Mode().Perm() != 0o700 {
		t.Fatalf("root %s mode %v %v", a, st.Mode(), err)
	}
	deny, err := agyOutsideDenies(filepath.Join(a, "ws"))
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(deny, b) {
		t.Fatalf("another run's folder %s is not denied: %v", b, deny)
	}
}

// An Antigravity author workspace is made inside its own run folder, which the daemon removes.
func TestAgyPrepareWorkspaceRecordsItsRunFolder(t *testing.T) {
	ws, err := prepareWorkspace(t.TempDir(), &Job{Run: testRun("r1", "author")}, agyAdapter{})
	if err != nil {
		t.Skipf("no run root here: %v", err)
	}
	defer os.RemoveAll(ws.RunRoot)
	tmp, _ := canonicalPath("/var/tmp")
	if ws.RunRoot == "" || filepath.Dir(ws.RunRoot) != tmp || !within(ws.Dir, ws.RunRoot) {
		t.Fatalf("workspace %s, run folder %s", ws.Dir, ws.RunRoot)
	}
	if other, err := prepareWorkspace(t.TempDir(), &Job{Run: testRun("r2", "author")}, claudeAdapter{}); err != nil || other.RunRoot != "" {
		t.Fatalf("a Claude workspace got a run folder: %+v %v", other, err)
	}
}

// A clean exit is not a success when the runtime reported a failed turn, and, for Antigravity
// (which exits 0 when it stops at a refused tool), when it reported no result at all.
func TestTurnFailureOverridesACleanExit(t *testing.T) {
	cases := []struct {
		a            Adapter
		over, failed bool
		wantErr      bool
	}{
		{agyAdapter{}, true, false, false},
		{agyAdapter{}, true, true, true},
		{agyAdapter{}, false, false, true},
		{claudeAdapter{}, true, true, true},
		{claudeAdapter{}, false, false, false},
	}
	for i, c := range cases {
		buf := &logBuffer{adapt: c.a, turnOver: c.over, turnFailed: c.failed}
		if err := turnFailure(c.a, buf); (err != nil) != c.wantErr || (err != nil && !errors.Is(err, errTurnFailed)) {
			t.Fatalf("case %d: %v", i, err)
		}
	}
	// A refused tool ends the run with status ERROR on the captured stream.
	buf := &logBuffer{adapt: agyAdapter{}}
	buf.add(`{"event":"result","result":{"status":"ERROR","finished_reason":"tool_denied"}}`)
	if err := turnFailure(agyAdapter{}, buf); err == nil {
		t.Fatal("a refused-tool stop counted as success")
	}
}

func TestAgyQualifiedVersionIsTheMeasuredSeries(t *testing.T) {
	for v, want := range map[string]bool{"1.5.16": true, "agy 1.5.16": true, "Antigravity CLI v1.5.3 (abc)": true,
		"1.6.0": false, "2.5.1": false, "1.50.1": false, "": false, "unknown": false} {
		if got := agyQualifiedVersion(v); got != want {
			t.Fatalf("%q: %v", v, got)
		}
	}
	run := func(_ context.Context, _ string, args ...string) (string, int, error) {
		if args[0] == "--version" {
			return "1.6.0\n", 0, nil
		}
		return "", 0, nil
	}
	if err := (agyAdapter{}).PreflightCLI(context.Background(), run); err == nil || !strings.Contains(err.Error(), "qualified") {
		t.Fatalf("an unqualified version passed preflight: %v", err)
	}
}

// Two Antigravity runs never overlap: the second waits for the first's release, or for its context.
func TestAgyRunsAreSerialized(t *testing.T) {
	path := filepath.Join(t.TempDir(), "agy.lock")
	first, err := lockFileWait(context.Background(), path)
	if err != nil {
		t.Skipf("no run locks here: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 600*time.Millisecond)
	defer cancel()
	if _, err := lockFileWait(ctx, path); err == nil {
		t.Fatal("a second run started while the first held the lock")
	}
	got := make(chan error, 1)
	go func() {
		release, err := lockFileWait(context.Background(), path)
		if err == nil {
			release()
		}
		got <- err
	}()
	time.Sleep(300 * time.Millisecond)
	first()
	select {
	case err := <-got:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the waiting run never started after the release")
	}
	if err := os.Symlink(path, path+".link"); err == nil {
		if _, err := lockFileWait(context.Background(), path+".link"); err == nil {
			t.Fatal("a symlinked lock was followed")
		}
	}
}

// An Antigravity pre-check gets its own run folder too, not the checker folder the other runtimes share.
func TestAgyPreCheckGetsItsOwnRunFolder(t *testing.T) {
	job := &Job{Run: testRun("c1", "pre-check")}
	ws, err := prepareWorkspace(t.TempDir(), job, agyAdapter{})
	if err != nil {
		t.Skipf("no run root here: %v", err)
	}
	defer removeRunRoot(ws.RunRoot)
	tmp, _ := canonicalPath("/var/tmp")
	if !ws.Checker || ws.RunRoot == "" || filepath.Dir(ws.RunRoot) != tmp || !within(ws.Dir, ws.RunRoot) || ws.Scratch == "" {
		t.Fatalf("pre-check workspace %+v", ws)
	}
	shared, err := checkerRoot("")
	if err != nil {
		t.Fatal(err)
	}
	if within(ws.Dir, shared) {
		t.Fatalf("the pre-check sits in the shared checker folder %s", shared)
	}
	deny, err := agyOutsideDenies(ws.Dir)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(deny, shared) {
		t.Fatalf("the shared checker folder is not denied: %v", deny)
	}
}
