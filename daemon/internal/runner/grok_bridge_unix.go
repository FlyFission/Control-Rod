//go:build unix

package runner

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
)

// ---- the JSON-RPC wire ----

type rpcMsg struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// grokBridge is one run's bridge.
type grokBridge struct {
	cfg  *grokBridgeConfig
	out  io.Writer
	outM sync.Mutex
	// sandboxed runs argv under a Seatbelt profile; tests replace it where there is no Seatbelt.
	sandboxed func(profile string, argv []string) *exec.Cmd
	baseEnv   []string
	cmdProf   string

	toGrok  io.Writer
	writeM  sync.Mutex
	nextID  int
	pendM   sync.Mutex
	pending map[string]chan rpcMsg

	termM     sync.Mutex
	terms     map[string]*grokTerm
	termSeq   int
	sessionID string

	textM sync.Mutex
	text  strings.Builder
	tools map[string]string

	// readClosed is closed when Grok's output ends; readErr says why.
	readClosed chan struct{}
	readErr    error
}

func seatbeltCmd(profile string, argv []string) *exec.Cmd {
	return exec.Command("/usr/bin/sandbox-exec", append([]string{"-p", profile}, argv...)...)
}

// GrokBridgeMain is `controlrod grok-bridge --bridge-config=... -- /path/to/grok agent ... stdio`.
func GrokBridgeMain(args []string, stdout, stderr io.Writer) int {
	cfg, grokArgv, err := parseBridgeArgs(args)
	if err != nil {
		fmt.Fprintln(stderr, "grok-bridge:", err)
		return 2
	}
	if runtime.GOOS != "darwin" {
		fmt.Fprintln(stderr, "grok-bridge: Grok CLI is fenced with macOS Seatbelt only")
		return 2
	}
	b := newGrokBridge(cfg, stdout, os.Environ(), seatbeltCmd)
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGHUP, syscall.SIGINT)
	defer stop()
	if err := b.run(ctx, grokArgv, stderr); err != nil {
		fmt.Fprintln(stderr, "grok-bridge:", err)
		return 1
	}
	return 0
}

func parseBridgeArgs(args []string) (*grokBridgeConfig, []string, error) {
	i := slices.Index(args, "--")
	if i != 1 || !strings.HasPrefix(args[0], grokBridgeConfigFlag) || len(args) < 3 {
		return nil, nil, errors.New("usage: grok-bridge --bridge-config=B64 -- /path/to/grok agent ... stdio")
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(args[0], grokBridgeConfigFlag))
	if err != nil {
		return nil, nil, fmt.Errorf("bad bridge config: %w", err)
	}
	var cfg grokBridgeConfig
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return nil, nil, fmt.Errorf("bad bridge config: %w", err)
	}
	for _, p := range append([]string{cfg.Workspace, cfg.RunHome, cfg.GrokHome}, append(cfg.WriteDirs, cfg.WriteFiles...)...) {
		if !filepath.IsAbs(p) || filepath.Clean(p) != p {
			return nil, nil, fmt.Errorf("bridge config path %q is not a clean absolute path", p)
		}
	}
	for _, p := range cfg.DeniedPrefixes {
		if !safePrefix.MatchString(p) {
			return nil, nil, fmt.Errorf("bridge config prefix %q has characters a profile cannot hold", p)
		}
	}
	if len(cfg.Denied) == 0 || len(cfg.WriteDirs) == 0 || cfg.Prompt == "" {
		return nil, nil, errors.New("bridge config is incomplete")
	}
	grokArgv := args[i+1:]
	// Launch by digest writes the verified program here. A bare name means the launch was not
	// verified, and nothing starts.
	if !filepath.IsAbs(grokArgv[0]) {
		return nil, nil, fmt.Errorf("grok program %q is not the verified absolute path", grokArgv[0])
	}
	if grokArgv[len(grokArgv)-1] != "stdio" || !slices.Contains(grokArgv, "agent") {
		return nil, nil, errors.New("the grok command is not `agent ... stdio`")
	}
	return &cfg, grokArgv, nil
}

func newGrokBridge(cfg *grokBridgeConfig, out io.Writer, env []string, sandboxed func(string, []string) *exec.Cmd) *grokBridge {
	return &grokBridge{cfg: cfg, out: out, sandboxed: sandboxed, baseEnv: env, cmdProf: grokCommandProfile(cfg),
		pending: map[string]chan rpcMsg{}, terms: map[string]*grokTerm{}, tools: map[string]string{}, readClosed: make(chan struct{})}
}

func (b *grokBridge) emit(v map[string]any) {
	line, err := json.Marshal(v)
	if err != nil {
		return
	}
	b.outM.Lock()
	defer b.outM.Unlock()
	_, _ = b.out.Write(append(line, '\n'))
}

func (b *grokBridge) finish(ok bool, reason string, usage map[string]any) {
	b.flushText()
	v := map[string]any{"grok_bridge": "result", "ok": ok}
	if reason != "" {
		v["reason"] = reason
	}
	if usage != nil {
		v["usage"] = usage
	}
	b.emit(v)
}

func (b *grokBridge) flushText() {
	b.textM.Lock()
	t := strings.TrimSpace(b.text.String())
	b.text.Reset()
	b.textM.Unlock()
	if t != "" {
		b.emit(map[string]any{"grok_bridge": "message", "text": t})
	}
}

// run starts Grok and drives one prompt. Any error ends the run with a failed result.
func (b *grokBridge) run(ctx context.Context, grokArgv []string, stderr io.Writer) (err error) {
	defer func() {
		if err != nil {
			b.finish(false, err.Error(), nil)
		}
	}()
	ef, err := StartEgressFilter(b.cfg.Hosts)
	if err != nil {
		return err
	}
	defer ef.Close()
	_, portS, _ := strings.Cut(ef.Addr(), ":")
	port, err := strconv.Atoi(portS)
	if err != nil {
		return fmt.Errorf("proxy address %q", ef.Addr())
	}
	cmd := b.sandboxed(grokProcessProfile(b.cfg, grokArgv[0], port), grokArgv)
	cmd.Dir = b.cfg.Workspace
	cmd.Env = grokProcessEnv(b.baseEnv, b.cfg, "http://"+ef.Addr())
	logf, err := os.OpenFile(filepath.Join(b.cfg.RunHome, grokStderrLog), os.O_CREATE|os.O_WRONLY|os.O_TRUNC|syscall.O_NOFOLLOW, 0o600)
	if err != nil {
		return err
	}
	defer logf.Close()
	cmd.Stderr = logf
	in, err := cmd.StdinPipe()
	if err != nil {
		return err
	}
	outPipe, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start Grok: %w", err)
	}
	b.toGrok = in
	go func() {
		b.readErr = b.read(outPipe)
		close(b.readClosed)
	}()
	defer func() {
		in.Close()
		b.killTerms()
		_ = cmd.Process.Signal(syscall.SIGTERM)
		done := make(chan struct{})
		go func() { _ = cmd.Wait(); close(done) }()
		select {
		case <-done:
		case <-time.After(3 * time.Second):
			killTree(cmd.Process.Pid)
			<-done
		}
		if err != nil {
			tailLog(filepath.Join(b.cfg.RunHome, grokStderrLog), stderr)
		}
	}()
	return b.session(ctx)
}

func (b *grokBridge) session(ctx context.Context) error {
	call := func(method string, params any, wait time.Duration) (json.RawMessage, error) {
		c, cancel := context.WithTimeout(ctx, wait)
		defer cancel()
		return b.call(c, method, params)
	}
	if _, err := call("initialize", map[string]any{
		"protocolVersion":    1,
		"clientCapabilities": map[string]any{"fs": map[string]any{"readTextFile": true, "writeTextFile": true}, "terminal": true},
		"clientInfo":         map[string]any{"name": "controlrod", "version": "1"},
	}, 2*time.Minute); err != nil {
		return fmt.Errorf("Grok did not start its session: %w", err)
	}
	res, err := call("session/new", map[string]any{
		"cwd": b.cfg.Workspace, "mcpServers": []any{},
		"_meta": map[string]any{
			"yoloMode": true,
			"agentProfile": map[string]any{"name": "controlrod-seat", "description": "Control Rod confined seat",
				"tools": grokProfileTools},
			"x.ai/hooks": map[string]any{"pre_tool_use": []any{map[string]any{
				"matcher": ".*", "hookCallbackIds": []string{grokHookID}, "timeout": 10}}},
		},
	}, 2*time.Minute)
	if err != nil {
		return fmt.Errorf("Grok did not open a session: %w", err)
	}
	var sess struct {
		SessionID string `json:"sessionId"`
		Models    struct {
			Current string `json:"currentModelId"`
		} `json:"models"`
	}
	if json.Unmarshal(res, &sess) != nil || sess.SessionID == "" {
		return errors.New("Grok opened a session without an id")
	}
	b.sessionID = sess.SessionID
	if err := b.allowlistApplied(ctx); err != nil {
		return err
	}
	b.emit(map[string]any{"grok_bridge": "init", "model": sess.Models.Current})
	c, cancel := context.WithCancel(ctx)
	defer cancel()
	res, err = b.call(c, "session/prompt", map[string]any{"sessionId": sess.SessionID,
		"prompt": []any{map[string]any{"type": "text", "text": b.cfg.Prompt}}})
	if err != nil {
		return err
	}
	var turn struct {
		StopReason string `json:"stopReason"`
		Meta       struct {
			ModelID string `json:"modelId"`
			Usage   struct {
				Input  *int `json:"inputTokens"`
				Output *int `json:"outputTokens"`
				Cached *int `json:"cachedReadTokens"`
			} `json:"usage"`
		} `json:"_meta"`
	}
	if json.Unmarshal(res, &turn) != nil {
		return errors.New("Grok ended its turn with an unreadable result")
	}
	if turn.Meta.ModelID != "" && turn.Meta.ModelID != sess.Models.Current {
		b.emit(map[string]any{"grok_bridge": "init", "model": turn.Meta.ModelID})
	}
	usage := map[string]any{}
	if u := turn.Meta.Usage; u.Input != nil || u.Output != nil {
		usage = map[string]any{"input_tokens": u.Input, "output_tokens": u.Output, "cache_read_tokens": u.Cached}
	}
	if turn.StopReason != "end_turn" {
		b.finish(false, "Grok ended its turn: "+token(turn.StopReason, 60), usage)
		return nil
	}
	b.finish(true, "", usage)
	return nil
}

// allowlistApplied fails the run unless Grok's own log says it applied the session's tool
// allowlist: Grok keeps its full toolset, silently, when it cannot map an entry.
func (b *grokBridge) allowlistApplied(ctx context.Context) error {
	path := filepath.Join(b.cfg.RunHome, grokDebugLog)
	deadline := time.Now().Add(10 * time.Second)
	for {
		data, _ := readNoFollow(path, grokMaxLine)
		if bytes.Contains(data, []byte(grokAllowlistUnmapped)) {
			return errors.New("Grok did not accept Control Rod's tool allowlist and would keep its full toolset, so the run is stopped")
		}
		if bytes.Contains(data, []byte(grokAllowlistApplied)) {
			return nil
		}
		if time.Now().After(deadline) || ctx.Err() != nil {
			return errors.New("Grok did not confirm Control Rod's tool allowlist, so the run is stopped")
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func readNoFollow(path string, max int64) ([]byte, error) {
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(io.LimitReader(f, max))
}

func tailLog(path string, w io.Writer) {
	data, err := readNoFollow(path, grokMaxRead)
	if err != nil || len(data) == 0 {
		return
	}
	if len(data) > 2000 {
		data = data[len(data)-2000:]
	}
	for _, l := range strings.Split(strings.TrimSpace(string(data)), "\n") {
		fmt.Fprintln(w, "grok:", strings.TrimLeft(l, "{["))
	}
}

func (b *grokBridge) send(m rpcMsg) error {
	m.JSONRPC = "2.0"
	line, err := json.Marshal(m)
	if err != nil {
		return err
	}
	b.writeM.Lock()
	defer b.writeM.Unlock()
	_, err = b.toGrok.Write(append(line, '\n'))
	return err
}

func (b *grokBridge) call(ctx context.Context, method string, params any) (json.RawMessage, error) {
	raw, err := json.Marshal(params)
	if err != nil {
		return nil, err
	}
	b.pendM.Lock()
	b.nextID++
	id := json.RawMessage(strconv.Itoa(b.nextID))
	ch := make(chan rpcMsg, 1)
	b.pending[string(id)] = ch
	b.pendM.Unlock()
	if err := b.send(rpcMsg{ID: id, Method: method, Params: raw}); err != nil {
		return nil, fmt.Errorf("write to Grok: %w", err)
	}
	select {
	case m := <-ch:
		if m.Error != nil {
			return nil, fmt.Errorf("%s: %s", method, token(m.Error.Message, 200))
		}
		return m.Result, nil
	case <-b.readClosed:
		// A reply that arrived just before the output ended is still taken.
		select {
		case m := <-ch:
			if m.Error == nil {
				return m.Result, nil
			}
		default:
		}
		err := b.readErr
		if err == nil {
			err = errors.New("Grok closed its output")
		}
		return nil, fmt.Errorf("%s: %w", method, err)
	case <-ctx.Done():
		return nil, fmt.Errorf("%s: %w", method, context.Cause(ctx))
	}
}

func (b *grokBridge) read(r io.Reader) error {
	br := bufio.NewReaderSize(r, 1<<16)
	for {
		line, err := br.ReadBytes('\n')
		if len(line) > grokMaxLine {
			return errors.New("Grok sent a message larger than the bridge accepts")
		}
		if len(bytes.TrimSpace(line)) > 0 {
			var m rpcMsg
			if json.Unmarshal(line, &m) == nil {
				b.dispatch(m)
			}
		}
		if err != nil {
			if errors.Is(err, io.EOF) {
				return nil
			}
			return err
		}
	}
}

func (b *grokBridge) dispatch(m rpcMsg) {
	switch {
	case m.Method == "" && len(m.ID) > 0:
		b.pendM.Lock()
		ch := b.pending[string(m.ID)]
		delete(b.pending, string(m.ID))
		b.pendM.Unlock()
		if ch != nil {
			ch <- m
		}
	case m.Method != "" && len(m.ID) > 0:
		go b.answer(m)
	case m.Method == "session/update":
		b.update(m.Params)
	}
}

func (b *grokBridge) answer(m rpcMsg) {
	res, rerr := b.handle(m.Method, m.Params)
	reply := rpcMsg{ID: m.ID}
	if rerr != nil {
		reply.Error = rerr
	} else {
		raw, err := json.Marshal(res)
		if err != nil {
			reply.Error = &rpcError{Code: -32603, Message: "internal error"}
		} else {
			reply.Result = raw
		}
	}
	_ = b.send(reply)
}

func (b *grokBridge) toolRefused(name, id, why string) {
	b.emit(map[string]any{"grok_bridge": "tool", "state": "error", "id": id, "name": name, "text": why})
}

// handle answers one request from Grok. Unknown methods are refused, never guessed.
func (b *grokBridge) handle(method string, params json.RawMessage) (any, *rpcError) {
	bad := &rpcError{Code: -32602, Message: "invalid params"}
	switch method {
	case "_x.ai/hooks/run":
		var p struct {
			ID        string `json:"hookCallbackId"`
			Event     string `json:"hookEventName"`
			ToolName  string `json:"toolName"`
			ToolUseID string `json:"toolUseId"`
		}
		if json.Unmarshal(params, &p) != nil {
			return map[string]any{"decision": "deny", "reason": grokGateReason}, nil
		}
		if p.ID == grokHookID && p.Event == "pre_tool_use" && slices.Contains(grokAllowedTools, p.ToolName) {
			return map[string]any{"decision": "allow"}, nil
		}
		b.toolRefused(p.ToolName, p.ToolUseID, grokGateReason)
		return map[string]any{"decision": "deny", "reason": grokGateReason}, nil
	case "session/request_permission":
		var p struct {
			ToolCall struct {
				ID    string `json:"toolCallId"`
				Title string `json:"title"`
				Meta  struct {
					Tool struct {
						Name string `json:"name"`
					} `json:"x.ai/tool"`
				} `json:"_meta"`
			} `json:"toolCall"`
			Options []struct {
				ID   string `json:"optionId"`
				Kind string `json:"kind"`
			} `json:"options"`
		}
		if json.Unmarshal(params, &p) != nil {
			return map[string]any{"outcome": map[string]any{"outcome": "cancelled"}}, nil
		}
		name := p.ToolCall.Meta.Tool.Name
		if name == "" {
			name = b.toolName(p.ToolCall.ID)
		}
		want := "reject_once"
		if slices.Contains(grokAllowedTools, name) {
			want = "allow_once"
		} else {
			b.toolRefused(name, p.ToolCall.ID, grokGateReason)
		}
		for _, o := range p.Options {
			if o.Kind == want {
				return map[string]any{"outcome": map[string]any{"outcome": "selected", "optionId": o.ID}}, nil
			}
		}
		return map[string]any{"outcome": map[string]any{"outcome": "cancelled"}}, nil
	case "fs/read_text_file":
		var p struct {
			Path  string `json:"path"`
			Line  *int   `json:"line"`
			Limit *int   `json:"limit"`
		}
		if json.Unmarshal(params, &p) != nil || !filepath.IsAbs(p.Path) {
			return nil, bad
		}
		data, err := b.fenced([]string{"/bin/cat", "--", p.Path}, nil, grokMaxRead)
		if err != nil {
			return nil, &rpcError{Code: -32000, Message: grokFenceReason + ": cannot read " + p.Path}
		}
		return map[string]any{"content": sliceLines(string(data), p.Line, p.Limit)}, nil
	case "fs/write_text_file":
		var p struct {
			Path    string `json:"path"`
			Content string `json:"content"`
		}
		if json.Unmarshal(params, &p) != nil || !filepath.IsAbs(p.Path) {
			return nil, bad
		}
		script := `d=$(/usr/bin/dirname -- "$1") && /bin/mkdir -p -- "$d" && exec /bin/cat > "$1"`
		if _, err := b.fenced([]string{"/bin/sh", "-c", script, "sh", p.Path}, strings.NewReader(p.Content), 1<<10); err != nil {
			return nil, &rpcError{Code: -32000, Message: grokFenceReason + ": cannot write " + p.Path}
		}
		return map[string]any{}, nil
	case "terminal/create":
		return b.termCreate(params)
	case "terminal/output", "terminal/wait_for_exit", "terminal/kill", "terminal/release":
		return b.termOp(method, params)
	}
	return nil, &rpcError{Code: -32601, Message: "method not supported by Control Rod"}
}

// fenced runs argv under the command profile and returns its output, at most max bytes.
func (b *grokBridge) fenced(argv []string, stdin io.Reader, max int64) ([]byte, error) {
	cmd := b.sandboxed(b.cmdProf, argv)
	cmd.Dir = b.cfg.Workspace
	cmd.Env = grokCommandEnv(b.baseEnv, nil, b.cfg)
	cmd.Stdin = stdin
	var out limitedBuffer
	out.max = int(max)
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil, err
	}
	if out.over {
		return nil, errors.New("output too large")
	}
	return out.buf.Bytes(), nil
}

type limitedBuffer struct {
	buf  bytes.Buffer
	max  int
	over bool
}

func (l *limitedBuffer) Write(p []byte) (int, error) {
	if room := l.max - l.buf.Len(); len(p) > room {
		l.over = true
		if room > 0 {
			l.buf.Write(p[:room])
		}
		return len(p), nil
	}
	return l.buf.Write(p)
}

// sliceLines keeps lines line (1-based) onward, at most limit of them, as ACP's read asks.
func sliceLines(s string, line, limit *int) string {
	if line == nil && limit == nil {
		return s
	}
	lines := strings.SplitAfter(s, "\n")
	start := 0
	if line != nil && *line > 1 {
		start = min(*line-1, len(lines))
	}
	end := len(lines)
	if limit != nil && *limit >= 0 && start+*limit < end {
		end = start + *limit
	}
	return strings.Join(lines[start:end], "")
}

// ---- terminals ----

type grokTerm struct {
	cmd   *exec.Cmd
	out   tailBuffer
	done  chan struct{}
	code  *int
	sig   *string
	mu    sync.Mutex
	limit int
}

// tailBuffer keeps the last limit bytes written, as ACP's output limit asks.
type tailBuffer struct {
	mu        sync.Mutex
	buf       []byte
	limit     int
	truncated bool
}

func (t *tailBuffer) Write(p []byte) (int, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.buf = append(t.buf, p...)
	if t.limit > 0 && len(t.buf) > t.limit {
		t.buf = slices.Clone(t.buf[len(t.buf)-t.limit:])
		t.truncated = true
	}
	return len(p), nil
}

func (t *tailBuffer) snapshot() (string, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	return strings.ToValidUTF8(string(t.buf), "�"), t.truncated
}

func (b *grokBridge) termCreate(params json.RawMessage) (any, *rpcError) {
	var p struct {
		Command string      `json:"command"`
		Args    []string    `json:"args"`
		Env     []acpEnvVar `json:"env"`
		Cwd     string      `json:"cwd"`
		Limit   int         `json:"outputByteLimit"`
	}
	if json.Unmarshal(params, &p) != nil || p.Command == "" {
		return nil, &rpcError{Code: -32602, Message: "invalid params"}
	}
	dir := b.cfg.Workspace
	if p.Cwd != "" {
		c, err := canonicalPath(p.Cwd)
		if err != nil || !within(c, b.cfg.Workspace) {
			return nil, &rpcError{Code: -32000, Message: grokFenceReason + ": commands run only inside the workspace"}
		}
		dir = c
	}
	argv := append([]string{p.Command}, p.Args...)
	if len(p.Args) == 0 {
		argv = []string{"/bin/sh", "-c", p.Command}
	}
	limit := p.Limit
	if limit <= 0 || limit > grokMaxRead {
		limit = grokMaxRead
	}
	t := &grokTerm{done: make(chan struct{}), limit: limit}
	t.out.limit = limit
	t.cmd = b.sandboxed(b.cmdProf, argv)
	t.cmd.Dir = dir
	t.cmd.Env = grokCommandEnv(b.baseEnv, p.Env, b.cfg)
	t.cmd.Stdout, t.cmd.Stderr = &t.out, &t.out
	if err := t.cmd.Start(); err != nil {
		return nil, &rpcError{Code: -32000, Message: "the command could not start"}
	}
	go func() {
		err := t.cmd.Wait()
		t.mu.Lock()
		if st, ok := t.cmd.ProcessState.Sys().(syscall.WaitStatus); ok && st.Signaled() {
			s := st.Signal().String()
			t.sig = &s
		} else {
			c := t.cmd.ProcessState.ExitCode()
			if err != nil && c < 0 {
				c = 1
			}
			t.code = &c
		}
		t.mu.Unlock()
		close(t.done)
	}()
	b.termM.Lock()
	b.termSeq++
	id := "cr-term-" + strconv.Itoa(b.termSeq)
	b.terms[id] = t
	b.termM.Unlock()
	return map[string]any{"terminalId": id}, nil
}

func (t *grokTerm) status() map[string]any {
	t.mu.Lock()
	defer t.mu.Unlock()
	return map[string]any{"exitCode": t.code, "signal": t.sig}
}

func (b *grokBridge) termOp(method string, params json.RawMessage) (any, *rpcError) {
	var p struct {
		ID string `json:"terminalId"`
	}
	_ = json.Unmarshal(params, &p)
	b.termM.Lock()
	t := b.terms[p.ID]
	if method == "terminal/release" {
		delete(b.terms, p.ID)
	}
	b.termM.Unlock()
	if t == nil {
		return nil, &rpcError{Code: -32602, Message: "unknown terminal"}
	}
	switch method {
	case "terminal/output":
		out, trunc := t.out.snapshot()
		res := map[string]any{"output": out, "truncated": trunc}
		select {
		case <-t.done:
			res["exitStatus"] = t.status()
		default:
		}
		return res, nil
	case "terminal/wait_for_exit":
		<-t.done
		return t.status(), nil
	default: // kill, release
		select {
		case <-t.done:
		default:
			killTree(t.cmd.Process.Pid)
		}
		return map[string]any{}, nil
	}
}

func (b *grokBridge) killTerms() {
	b.termM.Lock()
	defer b.termM.Unlock()
	for id, t := range b.terms {
		select {
		case <-t.done:
		default:
			killTree(t.cmd.Process.Pid)
		}
		delete(b.terms, id)
	}
}

// killTree kills pid and every process below it. Commands stay in the run's process group, so
// the daemon's own stop and freeze reach them too; this ends one command without the others.
func killTree(pid int) {
	if pid <= 0 {
		return
	}
	out, _ := exec.Command("/bin/ps", "-A", "-o", "pid=,ppid=").Output()
	kids := map[int][]int{}
	for _, l := range strings.Split(string(out), "\n") {
		f := strings.Fields(l)
		if len(f) != 2 {
			continue
		}
		c, e1 := strconv.Atoi(f[0])
		pp, e2 := strconv.Atoi(f[1])
		if e1 == nil && e2 == nil {
			kids[pp] = append(kids[pp], c)
		}
	}
	var walk func(int)
	walk = func(p int) {
		_ = syscall.Kill(p, syscall.SIGSTOP)
		for _, c := range kids[p] {
			walk(c)
		}
		_ = syscall.Kill(p, syscall.SIGKILL)
	}
	walk(pid)
}

// ---- the stream ----

func (b *grokBridge) toolName(id string) string {
	b.textM.Lock()
	defer b.textM.Unlock()
	return b.tools[id]
}

func (b *grokBridge) update(params json.RawMessage) {
	var p struct {
		Update struct {
			Kind    string          `json:"sessionUpdate"`
			Content json.RawMessage `json:"content"`
			ID      string          `json:"toolCallId"`
			Title   string          `json:"title"`
			Status  string          `json:"status"`
			Input   json.RawMessage `json:"rawInput"`
			Meta    struct {
				Tool struct {
					Name string `json:"name"`
				} `json:"x.ai/tool"`
			} `json:"_meta"`
		} `json:"update"`
	}
	if json.Unmarshal(params, &p) != nil {
		return
	}
	u := p.Update
	switch u.Kind {
	case "agent_message_chunk":
		var c struct {
			Type string `json:"type"`
			Text string `json:"text"`
		}
		if json.Unmarshal(u.Content, &c) == nil && c.Type == "text" {
			b.textM.Lock()
			if b.text.Len() < 1<<20 {
				b.text.WriteString(c.Text)
			}
			b.textM.Unlock()
		}
	case "tool_call":
		b.flushText()
		name := u.Meta.Tool.Name
		if name == "" {
			name = u.Title
		}
		b.textM.Lock()
		if len(b.tools) < 10000 {
			b.tools[u.ID] = name
		}
		b.textM.Unlock()
		v := map[string]any{"grok_bridge": "tool", "state": "start", "id": u.ID, "name": name}
		if len(u.Input) > 0 && len(u.Input) < 1<<16 && json.Valid(u.Input) {
			v["input"] = u.Input
		}
		b.emit(v)
	case "tool_call_update":
		if u.Status != "completed" && u.Status != "failed" {
			return
		}
		state := "done"
		if u.Status == "failed" {
			state = "error"
		}
		b.emit(map[string]any{"grok_bridge": "tool", "state": state, "id": u.ID, "name": b.toolName(u.ID)})
	}
}
