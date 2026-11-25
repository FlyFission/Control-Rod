//go:build unix

package runner

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
)

// fakeGrokAgent is a scripted ACP agent standing in for `grok agent stdio`. It drives the bridge
// through every request Grok 1.0.92 was seen to make and writes what the bridge answered, one
// line per check, to $CONTROLROD_TEST_FAKE_GROK_REPORT.
func fakeGrokAgent(scenario string) int {
	report, _ := os.OpenFile(os.Getenv("CONTROLROD_TEST_FAKE_GROK_REPORT"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	defer report.Close()
	note := func(format string, a ...any) { fmt.Fprintf(report, format+"\n", a...) }
	debug := ""
	for i, a := range os.Args {
		if a == "--debug-file" && i+1 < len(os.Args) {
			debug = os.Args[i+1]
		}
	}
	note("argv %s", strings.Join(os.Args[1:], " "))
	note("env HOME=%s GROK_HOME=%s TELEMETRY=%s PROXY=%t", os.Getenv("HOME"), os.Getenv("GROK_HOME"),
		os.Getenv("GROK_TELEMETRY_ENABLED"), os.Getenv("HTTPS_PROXY") != "")
	in := bufio.NewReader(os.Stdin)
	nextID := 0
	write := func(v map[string]any) {
		v["jsonrpc"] = "2.0"
		b, _ := json.Marshal(v)
		os.Stdout.Write(append(b, '\n'))
	}
	readMsg := func() map[string]any {
		line, err := in.ReadBytes('\n')
		if err != nil {
			return nil
		}
		var m map[string]any
		_ = json.Unmarshal(line, &m)
		return m
	}
	// ask sends a request to the client and returns its reply.
	ask := func(method string, params map[string]any) map[string]any {
		id := nextID
		nextID++
		params["sessionId"] = "s1"
		write(map[string]any{"id": id, "method": method, "params": params})
		for {
			m := readMsg()
			if m == nil {
				return nil
			}
			if got, ok := m["id"].(float64); ok && int(got) == id && m["method"] == nil {
				return m
			}
		}
	}
	reply := func(m map[string]any, result any) { write(map[string]any{"id": m["id"], "result": result}) }
	update := func(u map[string]any) {
		write(map[string]any{"method": "session/update", "params": map[string]any{"sessionId": "s1", "update": u}})
	}
	for {
		m := readMsg()
		if m == nil {
			return 0
		}
		switch m["method"] {
		case "initialize":
			if scenario == "crash" {
				return 3
			}
			reply(m, map[string]any{"protocolVersion": 1})
		case "session/new":
			p, _ := m["params"].(map[string]any)
			meta, _ := json.Marshal(p["_meta"])
			note("session/new meta %s", meta)
			line := "INFO tools allowlist applied tools=[...]"
			if scenario == "unmapped" {
				line = "WARN tools allowlist had unmappable entries; keeping full grok toolset"
			}
			_ = os.WriteFile(debug, []byte(line+"\n"), 0o600)
			reply(m, map[string]any{"sessionId": "s1", "models": map[string]any{"currentModelId": "grok-4.7"}})
		case "session/prompt":
			note("prompt received")
			if scenario == "hook_blocked" {
				reply(m, map[string]any{"stopReason": "hook_blocked"})
				continue
			}
			w := os.Getenv("CONTROLROD_TEST_FAKE_GROK_WS")
			hook := func(tool string) string {
				r := ask("_x.ai/hooks/run", map[string]any{"hookCallbackId": grokHookID, "hookEventName": "pre_tool_use",
					"toolName": tool, "toolUseId": "call-" + tool, "toolInput": map[string]any{}})
				res, _ := r["result"].(map[string]any)
				return fmt.Sprint(res["decision"])
			}
			for _, tool := range []string{"list_dir", "grep", "web_search", "search_tool", "use_tool", "read_file", "run_terminal_command", "write", "search_replace"} {
				note("hook %s %s", tool, hook(tool))
			}
			r := ask("_x.ai/hooks/run", map[string]any{"hookCallbackId": "someone-else", "hookEventName": "pre_tool_use", "toolName": "read_file"})
			res, _ := r["result"].(map[string]any)
			note("hook foreign-id %v", res["decision"])
			update(map[string]any{"sessionUpdate": "agent_message_chunk", "content": map[string]any{"type": "text", "text": "Working "}})
			update(map[string]any{"sessionUpdate": "tool_call", "toolCallId": "call-1", "title": "run_terminal_command",
				"rawInput": map[string]any{"command": "echo hi"}, "_meta": map[string]any{"x.ai/tool": map[string]any{"name": "run_terminal_command"}}})
			r = ask("terminal/create", map[string]any{"command": "/bin/sh -c 'echo hi; echo HOME=$HOME; echo X=$CR_X; echo P=$HTTPS_PROXY'", "cwd": w,
				"env": []map[string]any{{"name": "CR_X", "value": "1"}, {"name": "HTTPS_PROXY", "value": "http://evil"}, {"name": "GROK_HOME", "value": "/x"}}, "outputByteLimit": 20000})
			res, _ = r["result"].(map[string]any)
			term := fmt.Sprint(res["terminalId"])
			r = ask("terminal/wait_for_exit", map[string]any{"terminalId": term})
			res, _ = r["result"].(map[string]any)
			note("exit %v", res["exitCode"])
			r = ask("terminal/output", map[string]any{"terminalId": term})
			res, _ = r["result"].(map[string]any)
			note("output %q", res["output"])
			ask("terminal/release", map[string]any{"terminalId": term})
			update(map[string]any{"sessionUpdate": "tool_call_update", "toolCallId": "call-1", "status": "completed"})
			r = ask("terminal/create", map[string]any{"command": "/bin/sh -c 'echo x'", "cwd": "/"})
			note("outside-cwd error %v", r["error"] != nil)
			r = ask("terminal/create", map[string]any{"command": "/bin/sleep 30", "cwd": w})
			res, _ = r["result"].(map[string]any)
			start := time.Now()
			ask("terminal/kill", map[string]any{"terminalId": res["terminalId"]})
			ask("terminal/wait_for_exit", map[string]any{"terminalId": res["terminalId"]})
			note("killed fast %t", time.Since(start) < 5*time.Second)
			r = ask("fs/write_text_file", map[string]any{"path": filepath.Join(w, "out", "sub", "ok.txt"), "content": "done\nline2\nline3\n"})
			note("write error %v", r["error"] != nil)
			r = ask("fs/read_text_file", map[string]any{"path": filepath.Join(w, "out", "sub", "ok.txt"), "line": 2, "limit": 1})
			res, _ = r["result"].(map[string]any)
			note("read %q", res["content"])
			r = ask("fs/read_text_file", map[string]any{"path": "relative.txt"})
			note("relative error %v", r["error"] != nil)
			r = ask("_x.ai/unknown", map[string]any{})
			e, _ := r["error"].(map[string]any)
			note("unknown code %v", e["code"])
			r = ask("session/request_permission", map[string]any{"toolCall": map[string]any{"toolCallId": "c9", "title": "web_search",
				"_meta": map[string]any{"x.ai/tool": map[string]any{"name": "web_search"}}},
				"options": []map[string]any{{"optionId": "yes", "kind": "allow_once"}, {"optionId": "no", "kind": "reject_once"}}})
			res, _ = r["result"].(map[string]any)
			out, _ := res["outcome"].(map[string]any)
			note("permission web_search %v", out["optionId"])
			update(map[string]any{"sessionUpdate": "agent_message_chunk", "content": map[string]any{"type": "text", "text": "all done"}})
			reply(m, map[string]any{"stopReason": "end_turn", "_meta": map[string]any{"modelId": "grok-4.7",
				"usage": map[string]any{"inputTokens": 10, "outputTokens": 2, "cachedReadTokens": 4}}})
		}
	}
}

func fakeBridgeConfig(t *testing.T, checker bool) *grokBridgeConfig {
	t.Helper()
	base, _ := canonicalPath(t.TempDir())
	ws := filepath.Join(base, "ws")
	for _, d := range []string{filepath.Join(ws, "out"), filepath.Join(ws, "inputs")} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			t.Fatal(err)
		}
	}
	home, err := makeGrokRunHome(ws)
	if err != nil {
		t.Fatal(err)
	}
	cfg := &grokBridgeConfig{Workspace: ws, RunHome: home, GrokHome: filepath.Join(base, "user", ".grok"),
		Denied: []string{filepath.Join(base, "user")}, WriteDirs: []string{ws}, Hosts: []string{"grok.com:443"}, Prompt: Prompt, Checker: checker}
	return cfg
}

func runFakeBridge(t *testing.T, scenario string, cfg *grokBridgeConfig) (stream, report string, err error) {
	t.Helper()
	rep := filepath.Join(t.TempDir(), "report")
	self, _ := os.Executable()
	env := append(os.Environ(), helperFakeGrok+"="+scenario, "CONTROLROD_TEST_FAKE_GROK_REPORT="+rep, "CONTROLROD_TEST_FAKE_GROK_WS="+cfg.Workspace)
	var out bytes.Buffer
	// No Seatbelt here: the protocol, the gate and the stream are what this test checks; the fence
	// itself is measured on macOS (TestGrokQualification).
	b := newGrokBridge(cfg, &out, env, func(_ string, argv []string) *exec.Cmd { return exec.Command(argv[0], argv[1:]...) })
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	argv := []string{self, "agent", "--always-approve", "--no-leader", "--debug-file", filepath.Join(cfg.RunHome, grokDebugLog), "stdio"}
	var stderr bytes.Buffer
	err = b.run(ctx, argv, &stderr)
	r, _ := os.ReadFile(rep)
	return out.String(), string(r), err
}

func TestGrokBridgeDrivesOneTurn(t *testing.T) {
	cfg := fakeBridgeConfig(t, false)
	stream, report, err := runFakeBridge(t, "ok", cfg)
	if err != nil {
		t.Fatalf("bridge: %v\nreport:\n%s\nstream:\n%s", err, report, stream)
	}
	for _, want := range []string{
		"hook list_dir deny", "hook grep deny", "hook web_search deny", "hook search_tool deny", "hook use_tool deny",
		"hook read_file allow", "hook run_terminal_command allow", "hook write allow", "hook search_replace allow",
		"hook foreign-id deny",
		"exit 0",
		`output "hi\nHOME=` + cfg.termHome() + `\nX=1\nP=\n"`,
		"outside-cwd error true", "killed fast true",
		"write error false", `read "line2\n"`, "relative error true",
		"unknown code -32601", "permission web_search no",
		"env HOME=" + cfg.RunHome + " GROK_HOME=" + cfg.GrokHome + " TELEMETRY=0 PROXY=true",
	} {
		if !strings.Contains(report, want) {
			t.Errorf("the bridge did not answer %q\nreport:\n%s", want, report)
		}
	}
	if !strings.Contains(report, `"tools":["run_terminal_cmd","read_file","write","search_replace"]`) || !strings.Contains(report, `"x.ai/hooks"`) || !strings.Contains(report, `"yoloMode":true`) {
		t.Errorf("session/new did not carry the allowlist, the hook and yolo mode:\n%s", report)
	}
	if b, err := os.ReadFile(filepath.Join(cfg.Workspace, "out", "sub", "ok.txt")); err != nil || string(b) != "done\nline2\nline3\n" {
		t.Errorf("the delegated write did not land: %q %v", b, err)
	}
	a := grokAdapter{}
	var ended, failed bool
	var kinds []string
	var model string
	for _, line := range strings.Split(strings.TrimSpace(stream), "\n") {
		if e, f := a.TurnEnd(line); e {
			ended, failed = true, f
		}
		if m := a.StreamModel(line); m != "" {
			model = m
		}
		for _, ev := range a.Normalize(line, time.Now()) {
			kinds = append(kinds, ev.Kind)
		}
	}
	if !ended || failed || model != "grok-4.7" {
		t.Fatalf("turn ended=%t failed=%t model=%q\n%s", ended, failed, model, stream)
	}
	for _, k := range []string{EvToolStart, EvToolEnd, EvMessage, EvUsage} {
		if !slices.Contains(kinds, k) {
			t.Errorf("no %s event from the stream:\n%s", k, stream)
		}
	}
	if !strings.Contains(stream, grokGateReason) {
		t.Errorf("a refused tool was not reported in the stream:\n%s", stream)
	}
}

func TestGrokBridgeFailsClosed(t *testing.T) {
	for _, tc := range []struct{ scenario, reason string }{
		{"unmapped", "tool allowlist"},
		{"hook_blocked", "hook_blocked"},
		{"crash", "did not start"},
	} {
		t.Run(tc.scenario, func(t *testing.T) {
			stream, report, _ := runFakeBridge(t, tc.scenario, fakeBridgeConfig(t, false))
			if tc.scenario == "unmapped" && strings.Contains(report, "prompt received") {
				t.Fatal("the prompt was sent although Grok kept its full toolset")
			}
			a := grokAdapter{}
			var ended, failed bool
			for _, line := range strings.Split(strings.TrimSpace(stream), "\n") {
				if e, f := a.TurnEnd(line); e {
					ended, failed = true, f
				}
			}
			if !ended || !failed || !strings.Contains(stream, tc.reason) {
				t.Fatalf("want a failed result naming %q, got:\n%s", tc.reason, stream)
			}
		})
	}
}

func TestGrokBridgeArgs(t *testing.T) {
	cfg := fakeBridgeConfig(t, false)
	raw, _ := json.Marshal(cfg)
	flag := grokBridgeConfigFlag + base64.StdEncoding.EncodeToString(raw)
	if _, _, err := parseBridgeArgs([]string{flag, "--", "grok", "agent", "stdio"}); err == nil {
		t.Fatal("a bare grok name (launch not verified) was accepted")
	}
	if _, _, err := parseBridgeArgs([]string{flag, "--", "/x/grok", "-p", "hi"}); err == nil {
		t.Fatal("a headless grok command was accepted")
	}
	if _, argv, err := parseBridgeArgs([]string{flag, "--", "/x/grok", "agent", "stdio"}); err != nil || argv[0] != "/x/grok" {
		t.Fatalf("a verified agent command was refused: %v", err)
	}
	bad := *cfg
	bad.Workspace = "relative"
	raw, _ = json.Marshal(&bad)
	if _, _, err := parseBridgeArgs([]string{grokBridgeConfigFlag + base64.StdEncoding.EncodeToString(raw), "--", "/x/grok", "agent", "stdio"}); err == nil {
		t.Fatal("a relative workspace was accepted")
	}
	args := []string{"/self", grokBridgeCommand, flag, "--", "grok", "agent", "stdio"}
	if i := bridgeExeIndex(args); i != 4 {
		t.Fatalf("bridgeExeIndex = %d", i)
	}
	if bridgeExeIndex([]string{"/usr/bin/claude", "-p", "--", "x"}) != 0 {
		t.Fatal("a plain runtime command was taken for the bridge")
	}
	cmd := exec.Command("/self", args[1:]...)
	(&VerifiedLaunch{Path: "/verified/grok"}).Apply(cmd)
	if cmd.Path != "/self" || cmd.Args[4] != "/verified/grok" {
		t.Fatalf("Apply did not keep the bridge and point it at the verified grok: %q %q", cmd.Path, cmd.Args)
	}
}

func TestGrokProfiles(t *testing.T) {
	cfg := fakeBridgeConfig(t, false)
	user := cfg.Denied[0]
	g := grokProcessProfile(cfg, filepath.Join(cfg.GrokHome, "downloads", "grok-1.0.92"), 4242)
	for _, want := range []string{
		"(deny network-outbound)", `(remote ip "localhost:4242")`, "(deny file-write*)",
		"(deny file-read*\n    (subpath " + sbplString(user) + "))",
		"(subpath " + sbplString(cfg.Workspace) + ")",
		"(literal " + sbplString(filepath.Join(cfg.GrokHome, "auth.json")) + ")",
	} {
		if !strings.Contains(g, want) {
			t.Errorf("Grok's profile lacks %q:\n%s", want, g)
		}
	}
	writes := g[strings.Index(g, "(allow file-write*"):]
	if strings.Contains(writes, sbplString(cfg.Workspace)+")") || strings.Contains(writes, sbplString(filepath.Join(cfg.GrokHome, "auth.json"))+")") {
		t.Errorf("the Grok process may write the workspace or its login:\n%s", writes)
	}
	for _, never := range []string{"hooks", "skills", "personas", "memory-v2"} {
		if strings.Contains(g, sbplString(filepath.Join(cfg.GrokHome, never))) {
			t.Errorf("Grok's profile opens %s", never)
		}
	}
	c := grokCommandProfile(cfg)
	for _, want := range []string{
		"(deny network*)", "(deny file-write*)",
		"(subpath " + sbplString(user) + ")", "(subpath " + sbplString(cfg.RunHome) + ")",
		"(allow file-read*\n    (subpath " + sbplString(cfg.Workspace) + ")\n    (subpath " + sbplString(cfg.termHome()) + "))",
		`(literal "/usr/bin/security")`, "com.apple.SecurityServer",
	} {
		if !strings.Contains(c, want) {
			t.Errorf("the command profile lacks %q:\n%s", want, c)
		}
	}
	if strings.Contains(c, "localhost") || strings.Contains(c, "auth.json") {
		t.Errorf("the command profile opens the network or the login:\n%s", c)
	}
	// A checker's commands write only the verdict files and the evidence folder.
	ck := fakeBridgeConfig(t, true)
	ck.WriteDirs = []string{filepath.Join(ck.Workspace, "scratch", "evidence")}
	ck.WriteFiles = []string{filepath.Join(ck.Workspace, "scratch", "verification.json")}
	cc := grokCommandProfile(ck)
	w := cc[strings.Index(cc, "(allow file-write*"):]
	if strings.Contains(w, sbplString(ck.Workspace)+")") || !strings.Contains(w, "verification.json") || !strings.Contains(w, "evidence") {
		t.Errorf("a checker's commands may write outside its verdict files:\n%s", w)
	}
}

func TestGrokCommandEnv(t *testing.T) {
	cfg := fakeBridgeConfig(t, false)
	env := grokCommandEnv([]string{"PATH=/usr/bin", "HOME=/Users/x", "HTTPS_PROXY=http://p", "OPENAI_API_KEY=k", "DYLD_INSERT_LIBRARIES=/x"},
		[]acpEnvVar{{"CLICOLOR_FORCE", "1"}, {"GROK_SESSION_ID", "s"}, {"BASH_ENV", "/x"}, {"LD_PRELOAD", "/x"}, {"A=B", "c"}}, cfg)
	got := strings.Join(env, "\n")
	for _, never := range []string{"HOME=/Users/x", "HTTPS_PROXY", "OPENAI_API_KEY", "DYLD_", "GROK_SESSION_ID", "BASH_ENV", "LD_PRELOAD", "A=B"} {
		if strings.Contains(got, never) {
			t.Errorf("a command receives %s:\n%s", never, got)
		}
	}
	if !strings.Contains(got, "CLICOLOR_FORCE=1") || !strings.Contains(got, "HOME="+cfg.termHome()) || !strings.Contains(got, "PATH=/usr/bin") {
		t.Errorf("a command lacks its own variables:\n%s", got)
	}
	g := strings.Join(grokProcessEnv([]string{"PATH=/usr/bin", "HOME=/Users/x", "HTTPS_PROXY=http://p"}, cfg, "http://127.0.0.1:1"), "\n")
	if strings.Contains(g, "http://p") || !strings.Contains(g, "HTTPS_PROXY=http://127.0.0.1:1") || !strings.Contains(g, "GROK_DISABLE_AUTOUPDATER=1") || !strings.Contains(g, "HOME="+cfg.RunHome) {
		t.Errorf("Grok's environment is wrong:\n%s", g)
	}
}

func TestSliceLines(t *testing.T) {
	two, one := 2, 1
	if got := sliceLines("a\nb\nc\n", &two, &one); got != "b\n" {
		t.Fatalf("got %q", got)
	}
	big := 99
	if got := sliceLines("a\nb", &big, nil); got != "" {
		t.Fatalf("got %q", got)
	}
	if got := sliceLines("a\nb", nil, nil); got != "a\nb" {
		t.Fatalf("got %q", got)
	}
}
