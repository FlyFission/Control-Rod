package gitworktree

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

// FailureCause is a closed vocabulary describing why a git worktree operation failed.
// Values never include repository paths or raw git stderr.
type FailureCause string

const (
	CauseBranchExists FailureCause = "branch_exists"
	CausePathExists   FailureCause = "path_exists"
	CauseLocked       FailureCause = "locked"
	CausePermission   FailureCause = "permission"
	CausePathTooLong  FailureCause = "path_too_long"
	CauseNotARepo     FailureCause = "not_a_repo"
	CauseKilled       FailureCause = "killed"
	CauseOther        FailureCause = "other"
)

// String returns the closed-vocabulary cause name.
func (c FailureCause) String() string {
	return string(c)
}

// GitFailureError describes a failed git operation without exposing raw stderr
// or repository filesystem paths.
type GitFailureError struct {
	Op    string
	Cause FailureCause
}

func (e *GitFailureError) Error() string {
	if e.Op == "" {
		return fmt.Sprintf("git operation failed: %s", e.Cause)
	}
	return fmt.Sprintf("git %s failed: %s", e.Op, e.Cause)
}

// ClassifyGitFailure maps raw git stderr text to the closed FailureCause vocabulary
// without echoing any repository paths or stderr content.
func ClassifyGitFailure(stderr string) FailureCause {
	low := strings.ToLower(stderr)

	switch {
	case strings.Contains(low, "signal: killed"),
		strings.Contains(low, "signal: terminated"),
		strings.Contains(low, "sigkill"),
		strings.Contains(low, "sigterm"),
		strings.Contains(low, "killed by signal"),
		strings.Contains(low, "context deadline exceeded"),
		strings.Contains(low, "context canceled"):
		return CauseKilled

	case strings.Contains(low, "not a git repository"),
		strings.Contains(low, "does not appear to be a git repository"),
		strings.Contains(low, "not a git worktree"):
		return CauseNotARepo

	case strings.Contains(low, "filename too long"),
		strings.Contains(low, "file name too long"),
		strings.Contains(low, "path too long"),
		strings.Contains(low, "enametoolong"):
		return CausePathTooLong

	case strings.Contains(low, "permission denied"),
		strings.Contains(low, "operation not permitted"),
		strings.Contains(low, "read-only file system"),
		strings.Contains(low, "eacces"),
		strings.Contains(low, "eperm"):
		return CausePermission

	case strings.Contains(low, "is locked"),
		strings.Contains(low, "cannot lock"),
		strings.Contains(low, "unable to create") && strings.Contains(low, ".lock"),
		strings.Contains(low, "another git process seems to be running"),
		strings.Contains(low, "index.lock"):
		return CauseLocked

	case strings.Contains(low, "a branch named") && strings.Contains(low, "already exists"),
		strings.Contains(low, "already checked out at"),
		strings.Contains(low, "is already used by worktree"),
		strings.Contains(low, "reference already exists"),
		strings.Contains(low, "branch") && strings.Contains(low, "already exists"):
		return CauseBranchExists

	case strings.Contains(low, "already exists"),
		strings.Contains(low, "already registered worktree"),
		strings.Contains(low, "file exists"),
		strings.Contains(low, "not an empty directory"),
		strings.Contains(low, "destination path"):
		return CausePathExists

	default:
		return CauseOther
	}
}

// ClassifyGitError combines command execution error context (such as context
// cancellation or signal termination) with stderr classification.
func ClassifyGitError(err error, stderr string) FailureCause {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
		return CauseKilled
	}
	if cause := ClassifyGitFailure(stderr); cause != CauseOther {
		return cause
	}
	if err != nil {
		return ClassifyGitFailure(err.Error())
	}
	return CauseOther
}
