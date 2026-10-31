package runner

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
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
// sees the daemon token or the API address.
func ChildEnv(environ []string) []string {
	out := make([]string, 0, len(environ))
	for _, kv := range environ {
		if strings.HasPrefix(kv, "CONTROLROD_") {
			continue
		}
		out = append(out, kv)
	}
	return out
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

// CodexArgs is the argument list for a Codex run. Codex runs read-only by default and refuses to
// run outside a Git repository, so the run gets an explicit workspace-write sandbox rooted at the
// run workspace and skips the repository check. Network inside the sandbox is turned on only
// when the job asks for it.
func CodexArgs(ws *Workspace, model string, network bool) []string {
	args := []string{"exec", "--json", "-s", "workspace-write", "--skip-git-repo-check", "-C", ws.Dir}
	if model != "" {
		args = append(args, "-m", model)
	}
	if network {
		args = append(args, "-c", "sandbox_workspace_write.network_access=true")
	}
	return append(args, Prompt)
}

// ClaudeArgs is the argument list for a Claude Code run in headless print mode.
func ClaudeArgs(ws *Workspace, model string) []string {
	args := []string{"-p", Prompt, "--output-format", "stream-json", "--verbose",
		"--permission-mode", ClaudePermissionMode, "--allowedTools", allowedTools(ws)}
	if model != "" {
		args = append(args, "--model", model)
	}
	return args
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
func LaunchFor(runtime string, run Run, ws *Workspace) Launch {
	l := Launch{Mode: "print", RequestedModel: RequestedModel(run)}
	if l.RequestedModel == "" {
		l.RequestedModel = "default"
	}
	switch runtime {
	case RuntimeClaude:
		l.PermissionMode = ClaudePermissionMode
		l.AllowedTools = strings.Split(allowedTools(ws), ",")
		l.Sandbox = "none"
	case RuntimeCodex:
		l.Sandbox = "workspace-write"
		if NeedsNetwork(ws) {
			l.Sandbox = "workspace-write+network"
		}
	case RuntimeFake:
		l.Mode = "fake"
		l.Sandbox = "none"
	}
	return l
}

// Command builds the process for a runtime, or nil for the fake runtime's copy mode.
func Command(runtime string, run Run, ws *Workspace) (*exec.Cmd, error) {
	switch run.Role {
	case "intake", "author", "pre-check":
	default:
		return nil, fmt.Errorf("run role %q has no approved legacy runtime launcher", run.Role)
	}
	model := RequestedModel(run)
	var cmd *exec.Cmd
	switch runtime {
	case RuntimeClaude:
		cmd = exec.Command("claude", ClaudeArgs(ws, model)...)
	case RuntimeCodex:
		cmd = exec.Command("codex", CodexArgs(ws, model, NeedsNetwork(ws))...)
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
	setProcessGroup(cmd)
	return cmd, nil
}

// ToolVersion reports `<bin> --version`, first line, or "" when it cannot be read.
func ToolVersion(bin string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, bin, "--version").Output()
	if err != nil {
		return ""
	}
	line, _, _ := strings.Cut(strings.TrimSpace(string(out)), "\n")
	return strings.TrimSpace(line)
}

// ErrTimeout is returned when a run outlives its timeout.
var ErrTimeout = errors.New("timeout")

// ExecHooks lets the daemon record a spawn receipt and stop a run gracefully.
type ExecHooks struct {
	// Started is called once the process exists, with its id. It records the spawn receipt; an
	// error means the run cannot be owned, so it is killed at once (fail closed). A nil receipt
	// with no error means this platform cannot identify processes.
	Started func(pid int) (*SpawnReceipt, error)
	// Snapshot records the run's outputs while it is frozen at the start of a stop; nothing written
	// after that counts (StopGracefully).
	Snapshot func()
	// Timings are the waits of the graceful stop ladder.
	Timings StopTimings
	// Linger is how long processes may outlive the leader before the unit is ended. Default 2 s.
	Linger time.Duration
}

// Execute runs cmd, sending each stdout line and each stderr line (prefixed "[stderr] ") to
// sink. When ctx ends it stops every process of the run gracefully through its containment unit
// (StopGracefully) and returns ctx's cause. When the leader exits on its own, processes it left
// behind are ended too, so the run is over only when its unit is empty. Without a receipt (no
// process identity on this platform) it kills the daemon's own child directly.
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
	// The leader is reaped here, not through cmd.Wait, so its exit is seen even while processes it
	// left behind still hold the output pipes.
	leader := make(chan *os.ProcessState, 1)
	go func() {
		st, _ := cmd.Process.Wait()
		leader <- st
	}()
	finish := func() {
		<-pumped
		_ = stdout.Close()
		_ = stderr.Close()
	}

	var receipt SpawnReceipt
	haveReceipt := false
	if h.Started != nil {
		r, rerr := h.Started(cmd.Process.Pid)
		if rerr != nil {
			killProcessGroup(cmd)
			<-leader
			finish()
			return fmt.Errorf("the run could not be owned, so it was stopped: %w", rerr)
		}
		if r != nil {
			receipt, haveReceipt = *r, true
		}
	}
	endUnit := func(t StopTimings, snapshot func()) {
		if haveReceipt {
			StopGracefully(receipt, t, snapshot)
			return
		}
		if snapshot != nil {
			snapshot()
		}
		killProcessGroup(cmd)
	}

	var st *os.ProcessState
	stopped := false
	select {
	case st = <-leader:
	case <-ctx.Done():
		stopped = true
		endUnit(h.Timings, h.Snapshot)
		st = <-leader
	}
	// Processes left behind may hold the pipes; give them a moment, then end the unit.
	select {
	case <-pumped:
	case <-time.After(h.Linger):
		endUnit(StopTimings{AfterHangup: 100 * time.Millisecond, Grace: time.Second}, nil)
	}
	if haveReceipt && receipt.Alive() {
		endUnit(StopTimings{AfterHangup: 100 * time.Millisecond, Grace: time.Second}, nil)
	}
	finish()
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
