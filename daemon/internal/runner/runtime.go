package runner

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// Prompt is the only instruction the daemon gives an agent. Everything else is in BRIEF.md,
// written by the control plane.
const Prompt = "Read inputs/BRIEF.md and do exactly what it says. Write every deliverable into out/."

// DefaultClaudeTools is the tool allowlist when a job has no inputs/TOOLS.txt.
const DefaultClaudeTools = "Read,Write,Edit,Glob,Grep,Bash(cr-site:*),WebSearch,WebFetch"

// Runtime names.
const (
	RuntimeClaude = "claude"
	RuntimeCodex  = "codex"
	RuntimeFake   = "fake"
)

// RuntimeFor maps a run's provider to a runtime name.
func RuntimeFor(provider string) string {
	switch strings.ToLower(provider) {
	case "claude", "anthropic", "claude-code":
		return RuntimeClaude
	case "codex", "openai":
		return RuntimeCodex
	case "fake":
		return RuntimeFake
	}
	return ""
}

// Detect lists the runtimes this machine can run. The fake runtime is offered only when
// CONTROLROD_ALLOW_FAKE=1, so a real daemon never claims test jobs.
func Detect(lookPath func(string) (string, error), getenv func(string) string) []string {
	var out []string
	if _, err := lookPath("claude"); err == nil {
		out = append(out, RuntimeClaude)
	}
	if _, err := lookPath("codex"); err == nil {
		out = append(out, RuntimeCodex)
	}
	if getenv("CONTROLROD_ALLOW_FAKE") == "1" {
		out = append(out, RuntimeFake)
	}
	return out
}

// ChildEnv is the parent environment with every CONTROLROD_ variable removed, so an agent never
// sees the daemon token or the API address, and with what a package manager set for the script
// that started the daemon removed too (launcherVar, launcherPath). This is a deny list on top of
// the inherited environment; the allowlist of ADR 0021 replaces it when confined runs land.
func ChildEnv(environ []string) []string {
	out := make([]string, 0, len(environ))
	for _, kv := range environ {
		key, val, _ := strings.Cut(kv, "=")
		switch {
		case strings.HasPrefix(key, "CONTROLROD_"), launcherVar(key):
			continue
		case key == "PATH":
			kv = "PATH=" + launcherPath(val)
		}
		out = append(out, kv)
	}
	return out
}

// launcherVar reports a variable a package manager sets for the script it runs: `pnpm cr` gives
// the daemon about a dozen (npm_config_*, npm_lifecycle_*, npm_package_*, pnpm_config_*, INIT_CWD,
// PNPM_SCRIPT_SRC_DIR). They describe Control Rod's launcher, not the agent's work, and some break
// tools in the agent's own shells: nvm refuses to load while npm_config_prefix is set. Only these
// lower-case and launcher-only names go; a user's own NPM_CONFIG_* or PNPM_HOME stays.
func launcherVar(key string) bool {
	return strings.HasPrefix(key, "npm_") || strings.HasPrefix(key, "pnpm_") ||
		key == "INIT_CWD" || key == "PNPM_SCRIPT_SRC_DIR"
}

// launcherPath removes from PATH what a package manager put in front of it for its script: each
// node_modules/.bin directory and node-gyp's shim directory. Under `pnpm cr` these are Control
// Rod's own development tools, which an agent has no business finding first.
func launcherPath(path string) string {
	parts := filepath.SplitList(path)
	kept := parts[:0]
	for _, p := range parts {
		c := filepath.Clean(p)
		if (filepath.Base(c) == ".bin" && filepath.Base(filepath.Dir(c)) == "node_modules") || filepath.Base(c) == "node-gyp-bin" {
			continue
		}
		kept = append(kept, p)
	}
	return strings.Join(kept, string(filepath.ListSeparator))
}

// ClaudeEnv is set on every Claude Code run. Background tasks (a Bash command with
// run_in_background, background agents) would outlive the turn that started them: in print mode
// they keep the process, and so the run, open after the final result, and nothing in the run
// waits for what they produce. Checked present in Claude Code 2.1.318.
var ClaudeEnv = []string{"CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1"}

// withEnv sets each KEY=value in env, replacing any earlier value, so a child sees exactly one.
func withEnv(env []string, set ...string) []string {
	for _, kv := range set {
		key, _, _ := strings.Cut(kv, "=")
		env = slices.DeleteFunc(env, func(e string) bool { k, _, _ := strings.Cut(e, "="); return k == key })
		env = append(env, kv)
	}
	return env
}

// NetworkDirective is the TOOLS.txt line that asks for network inside the runtime's sandbox.
// It is a directive for the daemon, never passed to a runtime as a tool name.
const NetworkDirective = "network: on"

// readTools reads inputs/TOOLS.txt: one tool per line, "#" starts a comment, and the line
// "network: on" asks for network inside the sandbox. A missing or empty file gives the default
// tools and no network.
func readTools(ws *Workspace) (tools []string, network bool) {
	b, err := os.ReadFile(filepath.Join(ws.Inputs, "TOOLS.txt"))
	if err != nil {
		return nil, false
	}
	for _, line := range strings.Split(string(b), "\n") {
		t := strings.TrimSpace(line)
		switch {
		case t == "" || strings.HasPrefix(t, "#"):
		case strings.EqualFold(t, NetworkDirective):
			network = true
		case strings.HasPrefix(strings.ToLower(t), "network:"):
			// Any other network value means no network.
		default:
			tools = append(tools, t)
		}
	}
	return tools, network
}

func allowedTools(ws *Workspace) string {
	tools, _ := readTools(ws)
	if len(tools) == 0 {
		return DefaultClaudeTools
	}
	return strings.Join(tools, ",")
}

// NeedsNetwork reports whether the job's TOOLS.txt asks for network inside the sandbox. The
// control plane writes the directive only for roles whose tools query public services.
func NeedsNetwork(ws *Workspace) bool {
	_, network := readTools(ws)
	return network
}

// CodexArgs is the argument list for a Codex run under its sandbox policy (ADR 0021): the run's
// permission profile and isolation (CodexPolicyArgs), rooted at the run workspace, outside any Git
// repository check. There is no network and no sandbox_mode.
func CodexArgs(ws *Workspace, model string, p *SandboxPolicy, at SandboxPaths) ([]string, error) {
	policy, err := CodexPolicyArgs(p, at)
	if err != nil {
		return nil, err
	}
	args := append([]string{"exec", "--json", "--skip-git-repo-check", "-C", ws.Dir}, policy...)
	if model != "" {
		args = append(args, "-m", model)
	}
	return append(args, Prompt), nil
}

// ClaudeArgs is the argument list for a Claude Code run in headless print mode under its sandbox
// policy (ADR 0021): only the policy's built-in tools exist, the role's allowlist decides which run
// without asking, nothing ambient is loaded, and the settings carry the command sandbox and the
// read and write rules. With a hook file, a PermissionRequest hook records each permission request
// there (spike S-3 showed the hook fires in print mode and the tool is refused, so this observes a
// refusal; it is not an approval channel).
func ClaudeArgs(ws *Workspace, model string, p *SandboxPolicy, at SandboxPaths) []string {
	args := []string{"-p", Prompt, "--output-format", "stream-json", "--verbose",
		"--permission-mode", ClaudePermissionMode, "--tools", ClaudeToolList(p), "--allowedTools", allowedTools(ws)}
	args = append(args, ClaudeIsolationArgs()...)
	if model != "" {
		args = append(args, "--model", model)
	}
	return append(args, "--settings", ClaudeSettings(p, at, ws.HookFile))
}

// permissionHook appends each PermissionRequest hook payload, one JSON object per line, to file.
func permissionHook(file string) map[string]any {
	quoted := "'" + strings.ReplaceAll(file, "'", `'\''`) + "'"
	return map[string]any{"PermissionRequest": []any{map[string]any{
		"matcher": "*",
		"hooks":   []any{map[string]any{"type": "command", "command": "{ cat; echo; } >> " + quoted}},
	}}}
}

// PermissionEvents reads hook payloads (one JSON object per line) into permission_request events.
func PermissionEvents(data []byte, now time.Time) []Event {
	var out []Event
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var p struct {
			Tool  string         `json:"tool_name"`
			Input map[string]any `json:"tool_input"`
		}
		if json.Unmarshal([]byte(line), &p) != nil || p.Tool == "" {
			continue
		}
		out = append(out, Event{Kind: EvPermission, At: now.UTC().Format(time.RFC3339Nano), Tool: token(p.Tool, 60),
			Summary: toolLabel(p.Tool, p.Input), InputDigest: digestOf(p.Input)})
	}
	return out
}

// ClaudePermissionMode is the permission mode every Claude Code run starts in.
const ClaudePermissionMode = "acceptEdits"

// RequestedModel is the model a run names, or "" when it leaves the choice to the runtime.
func RequestedModel(run Run) string {
	m := strings.TrimSpace(run.Runtime.Model)
	if m == "default" || m == "any" {
		return ""
	}
	return m
}

// Launch describes how a run was started, for the execution trace.
type Launch struct {
	Mode           string
	RequestedModel string
	PermissionMode string
	AllowedTools   []string
	Sandbox        string
}

// LaunchFor describes the launch Command builds for a runtime.
func LaunchFor(runtime string, run Run, ws *Workspace, p *SandboxPolicy) Launch {
	l := Launch{Mode: "print", RequestedModel: RequestedModel(run)}
	if l.RequestedModel == "" {
		l.RequestedModel = "default"
	}
	switch runtime {
	case RuntimeClaude:
		l.PermissionMode = ClaudePermissionMode
		l.AllowedTools = strings.Split(allowedTools(ws), ",")
		l.Sandbox = sandboxLabel(p)
	case RuntimeCodex:
		l.Sandbox = sandboxLabel(p)
	case RuntimeFake:
		l.Mode = "fake"
		l.Sandbox = "none"
	}
	return l
}

// sandboxLabel names the policy a launch ran under, for the execution trace.
func sandboxLabel(p *SandboxPolicy) string {
	if p == nil {
		return "none"
	}
	return fmt.Sprintf("%s:%s@v%d", p.Driver, p.ID, p.Version)
}

// Command builds the process for a runtime, or nil for the fake runtime's copy mode. An agent CLI
// is built only under a verified sandbox policy, with the allowlisted environment.
func Command(runtime string, run Run, ws *Workspace, p *SandboxPolicy, at SandboxPaths) (*exec.Cmd, error) {
	switch run.Role {
	case "intake", "author", "pre-check":
	default:
		return nil, fmt.Errorf("run role %q has no approved legacy runtime launcher", run.Role)
	}
	model := RequestedModel(run)
	var cmd *exec.Cmd
	switch runtime {
	case RuntimeClaude, RuntimeCodex:
		if p == nil {
			return nil, ErrNoPolicy
		}
		for _, l := range at.Logins {
			if within(l, at.Workspace) || within(at.Workspace, l) {
				return nil, ErrLoginInWorkspace
			}
		}
	}
	switch runtime {
	case RuntimeClaude:
		cmd = exec.Command("claude", ClaudeArgs(ws, model, p, at)...)
	case RuntimeCodex:
		args, err := CodexArgs(ws, model, p, at)
		if err != nil {
			return nil, err
		}
		cmd = exec.Command("codex", args...)
	case RuntimeFake:
		script := filepath.Join(ws.Inputs, "FAKE.sh")
		if _, err := os.Stat(script); err != nil {
			return nil, nil
		}
		cmd = exec.Command("bash", script)
	default:
		return nil, fmt.Errorf("runtime %q is not available on this machine", runtime)
	}
	cmd.Dir = ws.Dir
	cmd.Env = ChildEnv(os.Environ())
	if runtime != RuntimeFake {
		cmd.Env = AgentEnv(os.Environ())
	}
	if runtime == RuntimeClaude {
		cmd.Env = withEnv(cmd.Env, ClaudeEnv...)
	}
	setProcessGroup(cmd)
	return cmd, nil
}

// ErrTimeout is returned when a run outlives its timeout.
var ErrTimeout = errors.New("timeout")

// ExecHooks lets the daemon record a spawn receipt and stop a run gracefully.
type ExecHooks struct {
	// Started is called once the process exists, before it can be reaped, with its id. It records
	// the spawn receipt. An error means the run cannot be owned, so it is stopped at once (fail
	// closed); a receipt returned with the error names the unit to stop. A nil receipt with no
	// error means this platform cannot identify processes.
	Started func(pid int) (*SpawnReceipt, error)
	// BeforeStart is called immediately before the process is started; an error refuses the start.
	BeforeStart func() error
	// Snapshot records the run's outputs while it is frozen at the start of a stop; nothing written
	// after that counts (StopGracefully).
	Snapshot func()
	// Timings are the waits of the graceful stop ladder.
	Timings StopTimings
	// Linger is how long processes may outlive the leader before the unit is ended. Default 2 s.
	Linger time.Duration
}

// ErrUncontained means processes of the run could not be confirmed gone. The run is not over: its
// receipt must be kept and no completion sent, so its outcome stays unknown until a later sweep
// confirms the unit empty.
var ErrUncontained = errors.New("processes of the run could not be confirmed stopped")

// Execute runs cmd, sending each stdout line and each stderr line (prefixed "[stderr] ") to
// sink. When ctx ends it stops every process of the run gracefully through its containment unit
// (StopGracefully) and returns ctx's cause. When the leader exits on its own, processes it left
// behind are ended too: the run is over only when its unit is empty, and if that cannot be
// confirmed Execute returns ErrUncontained. On Linux the leader's exit is observed without reaping
// it, so its process id and group stay this run's until the very end.
func Execute(ctx context.Context, cmd *exec.Cmd, sink func(string), hooks ...ExecHooks) error {
	var h ExecHooks
	if len(hooks) > 0 {
		h = hooks[0]
	}
	if h.Linger <= 0 {
		h.Linger = 2 * time.Second
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}
	if h.BeforeStart != nil {
		if err := h.BeforeStart(); err != nil {
			return err
		}
	}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start %s: %w", filepath.Base(cmd.Path), err)
	}
	var wg sync.WaitGroup
	pump := func(r io.Reader, prefix string) {
		defer wg.Done()
		sc := bufio.NewScanner(r)
		sc.Buffer(make([]byte, 64<<10), 16<<20)
		for sc.Scan() {
			sink(prefix + sc.Text())
		}
	}
	wg.Add(2)
	go pump(stdout, "")
	go pump(stderr, "[stderr] ")
	pumped := make(chan struct{})
	go func() { wg.Wait(); close(pumped) }()
	// drained waits a bounded time for the output pipes to close. A process still holding them
	// after the run's unit was handled is outside what containment can see, so the run is then
	// uncontained rather than waited on forever.
	drained := func(d time.Duration) bool {
		ok := true
		select {
		case <-pumped:
		case <-time.After(d):
			ok = false
		}
		_ = stdout.Close()
		_ = stderr.Close()
		return ok
	}
	// reapWithin waits a bounded time for the leader to be reaped.
	reapWithin := func(d time.Duration) bool {
		done := make(chan struct{})
		go func() { _, _ = cmd.Process.Wait(); close(done) }()
		select {
		case <-done:
			return true
		case <-time.After(d):
			return false
		}
	}
	fast := StopTimings{AfterHangup: 100 * time.Millisecond, Grace: time.Second}

	// Nothing reaps the leader before the receipt step: until then it is this daemon's unreaped
	// child, whose id and group cannot have been reused.
	var receipt SpawnReceipt
	haveReceipt := false
	if h.Started != nil {
		r, rerr := h.Started(cmd.Process.Pid)
		if rerr != nil {
			gone := true
			if r != nil {
				gone = StopGracefully(r.Pinned(), fast, nil)
			}
			// The launcher itself is still this daemon's unreaped child (it may never have reached its
			// scope): kill its group directly, then wait for it within a bound.
			killProcessGroup(cmd)
			gone = reapWithin(10*time.Second) && gone
			if !gone || !drained(time.Second) {
				return fmt.Errorf("%w; the run could not be owned: %v", ErrUncontained, rerr)
			}
			return fmt.Errorf("the run could not be owned, so it was stopped: %w", rerr)
		}
		if r != nil {
			// Held unreaped only where the leader's exit can be observed without reaping it.
			receipt, haveReceipt = *r, true
			if canWaitNoReap {
				receipt = receipt.Pinned()
			}
		}
	}

	// The leader's exit, observed without reaping it where the platform allows.
	exited := make(chan struct{})
	var reaped *os.ProcessState
	go func() {
		if canWaitNoReap && waitExitNoReap(cmd.Process.Pid) == nil {
			close(exited)
			return
		}
		reaped, _ = cmd.Process.Wait()
		close(exited)
	}()
	endUnit := func(t StopTimings, snapshot func()) bool {
		if haveReceipt {
			return StopGracefully(receipt, t, snapshot)
		}
		if snapshot != nil {
			snapshot()
		}
		_ = cmd.Process.Kill()
		return true
	}

	stopped, contained := false, true
	select {
	case <-exited:
	case <-ctx.Done():
		stopped = true
		contained = endUnit(h.Timings, h.Snapshot)
		if contained {
			<-exited
		}
	}
	// Processes left behind may hold the pipes; give them a moment, then end the unit.
	select {
	case <-pumped:
	case <-time.After(h.Linger):
		contained = endUnit(fast, nil) && contained
	}
	if contained && haveReceipt && receipt.Alive() {
		contained = endUnit(fast, nil)
	}
	if !contained {
		// Return at once: the caller keeps the receipt and sends nothing. Survivors may hold the
		// pipes, so our ends are closed; the leader is reaped whenever it goes.
		go func() {
			<-exited
			if reaped == nil {
				_, _ = cmd.Process.Wait()
			}
		}()
		_ = stdout.Close()
		_ = stderr.Close()
		return ErrUncontained
	}
	st := reaped
	if st == nil {
		st, _ = cmd.Process.Wait()
	}
	if !drained(h.Linger) {
		return ErrUncontained
	}
	if stopped {
		if c := context.Cause(ctx); c != nil {
			return c
		}
		return ctx.Err()
	}
	if st != nil && !st.Success() {
		return &exec.ExitError{ProcessState: st}
	}
	return nil
}

// CopyFakeOutputs copies inputs/FAKE_OUT/* into out/ for the fake runtime's copy mode.
func CopyFakeOutputs(ws *Workspace) error {
	src := filepath.Join(ws.Inputs, "FAKE_OUT")
	return filepath.WalkDir(src, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			if errors.Is(err, os.ErrNotExist) && p == src {
				return nil
			}
			return err
		}
		rel, _ := filepath.Rel(src, p)
		dst := filepath.Join(ws.Out, rel)
		if d.IsDir() {
			return os.MkdirAll(dst, 0o700)
		}
		b, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		return os.WriteFile(dst, b, 0o600)
	})
}
