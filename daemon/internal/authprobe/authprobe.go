// Package authprobe executes bounded, secret-free CLI authentication probes
// whose stdout and stderr are discarded and never recorded in diagnostics.
package authprobe

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"time"
)

// DefaultTimeout bounds an auth probe command when ctx has no deadline.
const DefaultTimeout = 10 * time.Second

// MethodCommand is the diagnostic method name recorded by ProbeCommand.
const MethodCommand = "command"

// AuthStatus represents the non-interactive authentication state of a runtime.
type AuthStatus string

const (
	Authorized   AuthStatus = "authorized"
	Configured   AuthStatus = "configured"
	Unauthorized AuthStatus = "unauthorized"
	Unknown      AuthStatus = "unknown"
)

// String returns the string form of the auth status.
func (s AuthStatus) String() string { return string(s) }

// Valid reports whether s is one of the defined AuthStatus values.
func (s AuthStatus) Valid() bool {
	switch s {
	case Authorized, Configured, Unauthorized, Unknown:
		return true
	default:
		return false
	}
}

// AuthDiagnostic records bounded execution metadata for an auth probe.
// Raw stdout, stderr, error messages, and credential strings are omitted by design.
type AuthDiagnostic struct {
	Method     string `json:"method"`
	Code       string `json:"code"`
	ExitCode   int    `json:"exit_code"`
	DurationMS int64  `json:"duration_ms"`
}

// ProbeCommand runs cmdPath with args and env under a bounded context while
// discarding stdout and stderr. classifyExit maps a process exit code to an
// AuthStatus and a safe diagnostic code. When env is nil, an empty environment
// is used so ambient daemon secrets are never inherited implicitly.
func ProbeCommand(
	ctx context.Context,
	cmdPath string,
	args []string,
	env []string,
	classifyExit func(exitCode int) (AuthStatus, string),
) (AuthStatus, AuthDiagnostic) {
	if ctx == nil {
		ctx = context.Background()
	}
	if cmdPath == "" {
		return Unknown, AuthDiagnostic{
			Method:   MethodCommand,
			Code:     "missing_binary",
			ExitCode: -1,
		}
	}
	if _, hasDeadline := ctx.Deadline(); !hasDeadline {
		var cancel context.CancelFunc
		ctx, cancel = context.WithTimeout(ctx, DefaultTimeout)
		defer cancel()
	}
	if classifyExit == nil {
		classifyExit = defaultClassifyExit
	}

	cmd := exec.CommandContext(ctx, cmdPath, args...)
	if env == nil {
		cmd.Env = []string{}
	} else {
		cmd.Env = env
	}
	cmd.Stdout = io.Discard
	cmd.Stderr = io.Discard
	cmd.WaitDelay = 500 * time.Millisecond

	start := time.Now()
	err := cmd.Run()
	durMS := time.Since(start).Milliseconds()

	if err == nil {
		status, code := classifyExit(0)
		if !status.Valid() {
			status = Unknown
		}
		if code == "" {
			code = "ok"
		}
		return status, AuthDiagnostic{
			Method:     MethodCommand,
			Code:       code,
			ExitCode:   0,
			DurationMS: durMS,
		}
	}

	if cerr := ctx.Err(); cerr != nil {
		code := "canceled"
		if errors.Is(cerr, context.DeadlineExceeded) {
			code = "timeout"
		}
		return Unknown, AuthDiagnostic{
			Method:     MethodCommand,
			Code:       code,
			ExitCode:   -1,
			DurationMS: durMS,
		}
	}

	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		ec := exitErr.ExitCode()
		status, code := classifyExit(ec)
		if !status.Valid() {
			status = Unknown
		}
		if code == "" {
			code = fmt.Sprintf("exit_%d", ec)
		}
		return status, AuthDiagnostic{
			Method:     MethodCommand,
			Code:       code,
			ExitCode:   ec,
			DurationMS: durMS,
		}
	}

	return Unknown, AuthDiagnostic{
		Method:     MethodCommand,
		Code:       classifyExecError(err),
		ExitCode:   -1,
		DurationMS: durMS,
	}
}

func defaultClassifyExit(exitCode int) (AuthStatus, string) {
	if exitCode == 0 {
		return Authorized, "ok"
	}
	return Unauthorized, "exit_nonzero"
}

func classifyExecError(err error) string {
	switch {
	case errors.Is(err, exec.ErrNotFound), errors.Is(err, os.ErrNotExist):
		return "not_found"
	case errors.Is(err, os.ErrPermission):
		return "permission_denied"
	default:
		return "exec_error"
	}
}
