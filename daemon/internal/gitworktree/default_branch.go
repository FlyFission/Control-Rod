package gitworktree

import (
	"context"
	"errors"
	"slices"
	"strings"
	"time"
)

// ErrUnresolved indicates that no authoritative default branch signal could be
// found for the repository.
var ErrUnresolved = errors.New("default branch unresolved")

const defaultLSRemoteTimeout = 10 * time.Second

// DefaultBranchResolver resolves a repository's default branch strictly from
// authoritative signals without guessing from local HEAD.
type DefaultBranchResolver struct {
	// LSRemoteTimeout bounds `git ls-remote --symref` calls. Zero uses 10s.
	LSRemoteTimeout time.Duration
	// DisableLSRemote skips network `git ls-remote --symref` queries.
	DisableLSRemote bool
}

// Resolve returns the authoritative default branch name for repoDir, or
// ErrUnresolved when no authoritative signal succeeds.
func (r DefaultBranchResolver) Resolve(ctx context.Context, repoDir string) (string, error) {
	if repoDir == "" {
		return "", ErrUnresolved
	}
	if _, err := osStatDir(repoDir); err != nil {
		return "", ErrUnresolved
	}

	remote, err := r.selectRemote(ctx, repoDir)
	if err == nil && remote != "" {
		// 1. Try live remote symref with bounded timeout unless disabled.
		if !r.DisableLSRemote {
			if branch, ok := r.resolveLSRemote(ctx, repoDir, remote); ok {
				if valid, ok := r.validateBranch(ctx, repoDir, branch); ok {
					return valid, nil
				}
			}
		}
		// 2. Fall back to cached refs/remotes/<remote>/HEAD.
		if branch, ok := r.resolveCachedRemoteHead(ctx, repoDir, remote); ok {
			if valid, ok := r.validateBranch(ctx, repoDir, branch); ok {
				return valid, nil
			}
		}
	}

	// 3. Explicit local repository configuration (never global config or HEAD).
	for _, key := range []string{"controlrod.defaultbranch", "init.defaultbranch"} {
		out, err := runHardenedGit(ctx, repoDir, "config", "--local", "--get", key)
		if err != nil {
			continue
		}
		candidate := strings.TrimSpace(out.stdout)
		if valid, ok := r.validateBranch(ctx, repoDir, candidate); ok {
			return valid, nil
		}
	}

	return "", ErrUnresolved
}

// FetchDefaultBranch resolves the default branch authoritatively and fetches it
// from its remote using --no-tags --no-recurse-submodules.
func (r DefaultBranchResolver) FetchDefaultBranch(ctx context.Context, repoDir string) (string, error) {
	branch, err := r.Resolve(ctx, repoDir)
	if err != nil {
		return "", err
	}
	remote, err := r.selectRemote(ctx, repoDir)
	if err != nil || remote == "" {
		return "", ErrUnresolved
	}
	timeout := r.LSRemoteTimeout
	if timeout <= 0 {
		timeout = defaultLSRemoteTimeout
	}
	fctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	if _, err := runHardenedGit(fctx, repoDir, "fetch", "--no-tags", "--no-recurse-submodules", "--", remote, branch); err != nil {
		return "", &GitFailureError{Op: "fetch", Cause: ClassifyGitError(err, "")}
	}
	return branch, nil
}

func (r DefaultBranchResolver) selectRemote(ctx context.Context, repoDir string) (string, error) {
	remotesOut, err := runHardenedGit(ctx, repoDir, "remote")
	if err != nil {
		return "", err
	}
	var remotes []string
	for _, line := range strings.Split(remotesOut.stdout, "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			remotes = append(remotes, line)
		}
	}
	if len(remotes) == 0 {
		return "", nil
	}

	if defOut, err := runHardenedGit(ctx, repoDir, "config", "--get", "checkout.defaultRemote"); err == nil {
		def := strings.TrimSpace(defOut.stdout)
		if def != "" && slices.Contains(remotes, def) {
			return def, nil
		}
	}
	if slices.Contains(remotes, "origin") {
		return "origin", nil
	}
	if len(remotes) == 1 {
		return remotes[0], nil
	}
	return "", nil
}

func (r DefaultBranchResolver) resolveLSRemote(ctx context.Context, repoDir, remote string) (string, bool) {
	timeout := r.LSRemoteTimeout
	if timeout <= 0 {
		timeout = defaultLSRemoteTimeout
	}
	lctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	out, err := runHardenedGit(lctx, repoDir, "ls-remote", "--symref", "--no-tags", "--", remote, "HEAD")
	if err != nil {
		return "", false
	}
	for _, line := range strings.Split(out.stdout, "\n") {
		// Expected format: "ref: refs/heads/<branch>\tHEAD"
		if !strings.HasPrefix(line, "ref: ") {
			continue
		}
		rest := strings.TrimPrefix(line, "ref: ")
		ref, target, ok := strings.Cut(rest, "\t")
		if !ok || strings.TrimSpace(target) != "HEAD" {
			continue
		}
		const prefix = "refs/heads/"
		if strings.HasPrefix(ref, prefix) {
			branch := strings.TrimPrefix(ref, prefix)
			if branch != "" {
				return branch, true
			}
		}
	}
	return "", false
}

func (r DefaultBranchResolver) resolveCachedRemoteHead(ctx context.Context, repoDir, remote string) (string, bool) {
	ref := "refs/remotes/" + remote + "/HEAD"
	out, err := runHardenedGit(ctx, repoDir, "symbolic-ref", "--quiet", ref)
	if err != nil {
		return "", false
	}
	target := strings.TrimSpace(out.stdout)
	prefix := "refs/remotes/" + remote + "/"
	if !strings.HasPrefix(target, prefix) {
		return "", false
	}
	branch := strings.TrimPrefix(target, prefix)
	if branch == "" || branch == "HEAD" {
		return "", false
	}
	return branch, true
}

func (r DefaultBranchResolver) validateBranch(ctx context.Context, repoDir, candidate string) (string, bool) {
	if candidate == "" ||
		strings.HasPrefix(candidate, "-") ||
		strings.HasPrefix(candidate, "@") ||
		strings.HasPrefix(candidate, "refs/") ||
		candidate == "HEAD" {
		return "", false
	}
	out, err := runHardenedGit(ctx, repoDir, "check-ref-format", "--branch", candidate)
	if err != nil {
		return "", false
	}
	clean := strings.TrimSpace(out.stdout)
	if clean == "" || clean != candidate {
		return "", false
	}
	return clean, true
}
