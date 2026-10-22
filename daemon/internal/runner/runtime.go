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
const DefaultClaudeTools = "Read,Write,Edit,Glob,Grep,Bash(cr-example:*),WebSearch,WebFetch"

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

func allowedTools(ws *Workspace) string {
	b, err := os.ReadFile(filepath.Join(ws.Inputs, "TOOLS.txt"))
	if err != nil {
		return DefaultClaudeTools
	}
	var tools []string
	for _, line := range strings.Split(string(b), "\n") {
		if t := strings.TrimSpace(line); t != "" && !strings.HasPrefix(t, "#") {
			tools = append(tools, t)
		}
	}
	if len(tools) == 0 {
		return DefaultClaudeTools
	}
	return strings.Join(tools, ",")
}

// Command builds the process for a runtime, or nil for the fake runtime's copy mode.
func Command(runtime string, run Run, ws *Workspace) (*exec.Cmd, error) {
	model := strings.TrimSpace(run.Runtime.Model)
	useModel := model != "" && model != "default"
	var cmd *exec.Cmd
	switch runtime {
	case RuntimeClaude:
		args := []string{"-p", Prompt, "--output-format", "stream-json", "--verbose",
			"--permission-mode", "acceptEdits", "--allowedTools", allowedTools(ws)}
		if useModel {
			args = append(args, "--model", model)
		}
		cmd = exec.Command("claude", args...)
	case RuntimeCodex:
		args := []string{"exec", "--json", "--cd", ws.Dir}
		if useModel {
			args = append(args, "-m", model)
		}
		args = append(args, Prompt)
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

// Execute runs cmd, sending each stdout line and each stderr line (prefixed "[stderr] ") to
// sink. When ctx ends it kills the whole process group and returns ctx's cause.
func Execute(ctx context.Context, cmd *exec.Cmd, sink func(string)) error {
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
	done := make(chan error, 1)
	go func() {
		wg.Wait()
		done <- cmd.Wait()
	}()
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		killProcessGroup(cmd)
		<-done
		if c := context.Cause(ctx); c != nil {
			return c
		}
		return ctx.Err()
	}
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
