package runner

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
)

func grokRun(role, model string) Run {
	run := testRun("run-grok", role)
	run.Runtime = RuntimeRef{Kind: "subscription", Provider: RuntimeGrok, Model: model}
	return run
}

// bridgeConfigOf reads the settings the daemon passes the bridge back out of its command.
func bridgeConfigOf(t *testing.T, args []string) *grokBridgeConfig {
	t.Helper()
	var flag string
	for _, a := range args {
		if strings.HasPrefix(a, grokBridgeConfigFlag) {
			flag = strings.TrimPrefix(a, grokBridgeConfigFlag)
		}
	}
	raw, err := base64.StdEncoding.DecodeString(flag)
	if err != nil {
		t.Fatal(err)
	}
	var cfg grokBridgeConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		t.Fatal(err)
	}
	return &cfg
}

func TestGrokCommandIsTheBridge(t *testing.T) {
	ws := workspaceWithTools(t, "")
	cmd, err := grokAdapter{}.Command(grokRun("author", "grok-4.7"), ws, testPolicy(), testPaths(ws))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(ws.RunHome) })
	self, _ := os.Executable()
	self, _ = filepath.EvalSymlinks(self)
	if cmd.Path != self || cmd.Args[1] != grokBridgeCommand {
		t.Fatalf("Grok must start through the bridge: %q %q", cmd.Path, cmd.Args)
	}
	i := bridgeExeIndex(cmd.Args)
	grok := cmd.Args[i:]
	if grok[0] != "grok" || grok[1] != "agent" || grok[len(grok)-1] != "stdio" || !slices.Contains(grok, "--always-approve") || !argPair(grok, "-m", "grok-4.7") {
		t.Fatalf("grok argv %q", grok)
	}
	cfg := bridgeConfigOf(t, cmd.Args)
	dir, _ := canonicalPath(ws.Dir)
	if cfg.Workspace != dir || cfg.RunHome != ws.RunHome || cfg.Checker || !slices.Equal(cfg.WriteDirs, []string{dir}) || cfg.Prompt != Prompt {
		t.Fatalf("bridge config %+v", cfg)
	}
	deniedHome, _ := canonicalPath("/home/u")
	if !slices.Contains(cfg.Denied, deniedHome) || !slices.Contains(cfg.Hosts, "api.x.ai:443") || !slices.Contains(cfg.Hosts, "cli-chat-proxy.grok.com:443") {
		t.Fatalf("bridge config denies or hosts %+v", cfg)
	}
	for _, sub := range []string{grokTmpDir, filepath.Join(grokTermDir, "tmp")} {
		if st, err := os.Stat(filepath.Join(ws.RunHome, sub)); err != nil || !st.IsDir() {
			t.Fatalf("run home lacks %s", sub)
		}
	}
	// A counted check accepts this command: no base URL, the run's model.
	if err := scanArgs(RuntimeGrok, cmd.Args); err != nil {
		t.Fatalf("counted-check scan refused the launch: %v", err)
	}
	if m, err := argvModel(RuntimeGrok, cmd.Args); err != nil || m != "grok-4.7" {
		t.Fatalf("argv model %q %v", m, err)
	}
}

func TestGrokCheckerWritesOnlyItsVerdict(t *testing.T) {
	ws := workspaceWithTools(t, "")
	ws.Checker, ws.Scratch = true, filepath.Join(ws.Dir, "scratch")
	cmd, err := grokAdapter{}.Command(grokRun("pre-check", ""), ws, testPolicy(), testPaths(ws))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(ws.RunHome) })
	cfg := bridgeConfigOf(t, cmd.Args)
	scratch, _ := canonicalPath(ws.Scratch)
	if !cfg.Checker || cfg.Prompt != CheckerPrompt || !slices.Equal(cfg.WriteDirs, []string{filepath.Join(scratch, "evidence")}) ||
		!slices.Equal(cfg.WriteFiles, []string{filepath.Join(scratch, "verification.json"), filepath.Join(scratch, "criterion-results.json")}) {
		t.Fatalf("checker config %+v", cfg)
	}
	if slices.Contains(cmd.Args, "-m") {
		t.Fatal("no model was asked for, so none may be named")
	}
	if !(grokAdapter{}).SelfConfinedChecker() {
		t.Fatal("a Grok checker cannot sit inside the outer profile")
	}
}

func TestGrokRefusesWhatItCannotConfine(t *testing.T) {
	var pe *PreflightError
	a := grokAdapter{}
	ws := workspaceWithTools(t, "network: on\n")
	if _, err := a.Command(grokRun("author", ""), ws, testPolicy(), testPaths(ws)); !errors.As(err, &pe) {
		t.Fatalf("a network role ran: %v", err)
	}
	ws = workspaceWithTools(t, "")
	p := testPolicy()
	p.AllowedHosts = []string{"example.com"}
	if _, err := a.Command(grokRun("author", ""), ws, p, testPaths(ws)); !errors.As(err, &pe) {
		t.Fatalf("a named-host policy ran: %v", err)
	}
	ws.Checkout = &CheckoutBinding{Path: ws.Dir}
	if _, err := a.Command(grokRun("author", ""), ws, testPolicy(), testPaths(ws)); !errors.As(err, &pe) || !strings.Contains(pe.Reason, "checkout") {
		t.Fatalf("a checkout run started: %v", err)
	}
	ws = workspaceWithTools(t, "")
	if _, err := a.Command(grokRun("author", "claude-opus-4-6"), ws, testPolicy(), testPaths(ws)); !errors.As(err, &pe) {
		t.Fatalf("another vendor's model ran: %v", err)
	}
	p = testPolicy()
	p.EnabledTools = []string{"read"}
	if _, err := a.Command(grokRun("author", ""), ws, p, testPaths(ws)); err == nil {
		t.Fatal("a policy without commands ran")
	}
	if _, err := a.Command(grokRun("author", ""), ws, nil, testPaths(ws)); err == nil {
		t.Fatal("a run without a policy ran")
	}
	// An instruction file Grok would load, in a folder the policy does not deny.
	ws = workspaceWithTools(t, "")
	if err := os.WriteFile(filepath.Join(ws.Dir, "AGENTS.md"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Command(grokRun("author", ""), ws, testPolicy(), testPaths(ws)); !errors.As(err, &pe) || !strings.Contains(pe.Reason, "AGENTS.md") {
		t.Fatalf("a planted AGENTS.md was not refused: %v", err)
	}
}

// A folder the policy denies is unreadable to Grok, so instruction files there do not refuse a
// run: the user's ~/.grok and ~/.claude sit above a daemon-home workspace.
func TestGrokIgnoresInstructionsInDeniedFolders(t *testing.T) {
	ws := workspaceWithTools(t, "")
	parent, _ := canonicalPath(filepath.Dir(ws.Dir))
	if err := os.MkdirAll(filepath.Join(parent, ".grok"), 0o700); err != nil {
		t.Fatal(err)
	}
	at := testPaths(ws)
	at.Home = parent
	if _, err := (grokAdapter{}).Command(grokRun("author", ""), ws, testPolicy(), at); err != nil {
		t.Fatalf("a .grok folder in the denied home refused the run: %v", err)
	}
	os.RemoveAll(ws.RunHome)
}

func TestGrokVersionLoginAndModels(t *testing.T) {
	for v, ok := range map[string]bool{"grok 1.0.92 (b06756fd6256) [stable]": true, "grok 1.0.93": false, "grok 1.0.92-beta": false, "": false} {
		if grokQualifiedVersion(v) != ok {
			t.Errorf("qualified(%q) != %t", v, ok)
		}
	}
	out := "You are logged in with grok.com.\n\nDefault model: grok-4.7\n\nAvailable models:\n  * grok-4.7 (default)\n  - grok-4.7-build-fast\n  - grok-4.6\n"
	if !grokSignedIn(out) || grokSignedIn("You are not authenticated.\n") {
		t.Fatal("login line misread")
	}
	if got := grokModels(out); !slices.Equal(got, []string{"grok-4.7", "grok-4.7-build-fast", "grok-4.6"}) {
		t.Fatalf("models %q", got)
	}
	a := grokAdapter{}
	if !a.ModelAllowed("grok-4.7") || a.ModelAllowed("claude-opus-4-6") || !a.ExitStatusUntrusted() {
		t.Fatal("model filter or exit status")
	}
	reg, err := DefaultModels()
	if err != nil {
		t.Fatal(err)
	}
	var grok []string
	for _, m := range reg.Models {
		if m.Harness == RuntimeGrok {
			grok = append(grok, m.ID)
			if !slices.Equal(m.Hosts, []string{"grok.com", "cli-chat-proxy.grok.com", "api.x.ai"}) {
				t.Fatalf("%s hosts %q", m.ID, m.Hosts)
			}
		}
	}
	if !slices.Equal(grok, []string{"grok-4.7", "grok-4.7-build-fast", "grok-4.6", "grok-4.5"}) {
		t.Fatalf("registered Grok models %q", grok)
	}
}

func TestGrokIsConfinedOnlyOnMacOS(t *testing.T) {
	gap := grokAdapter{}.ConfinementGap()
	if (runtime.GOOS == "darwin") != (gap == "") {
		t.Fatalf("gap %q on %s", gap, runtime.GOOS)
	}
}

func TestGrokStreamMissingResultIsAFailure(t *testing.T) {
	a := grokAdapter{}
	if e, _ := a.TurnEnd(`{"grok_bridge":"message","text":"hi"}`); e {
		t.Fatal("a message ended the turn")
	}
	if e, f := a.TurnEnd(`{"grok_bridge":"result"}`); !e || !f {
		t.Fatal("a result without ok must be a failed turn")
	}
	if e, f := a.TurnEnd(`{"grok_bridge":"result","ok":true}`); !e || f {
		t.Fatal("an ok result")
	}
	if e, _ := a.TurnEnd(`{"type":"result","subtype":"success"}`); e {
		t.Fatal("a Claude-shaped line from elsewhere ended a Grok turn")
	}
}
