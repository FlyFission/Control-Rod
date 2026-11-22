package filesnapshot

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func initTestRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	runTestGit(t, dir, "init", "-b", "main")
	runTestGit(t, dir, "config", "user.name", "Test User")
	runTestGit(t, dir, "config", "user.email", "test@example.com")
	writeTestFile(t, filepath.Join(dir, "tracked.txt"), "v1\n")
	writeTestFile(t, filepath.Join(dir, "keep.txt"), "keep\n")
	runTestGit(t, dir, "add", "tracked.txt", "keep.txt")
	runTestGit(t, dir, "commit", "-m", "initial commit")
	return dir
}

func runTestGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v failed: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestCapturePreservesBranchIndexAndStash(t *testing.T) {
	ctx := context.Background()
	dir := initTestRepo(t)

	// Create a stash entry to confirm git stash is untouched.
	writeTestFile(t, filepath.Join(dir, "tracked.txt"), "stash-me\n")
	runTestGit(t, dir, "stash", "push", "-m", "user-stash")
	stashBefore := runTestGit(t, dir, "stash", "list")

	// Stage one change in the real index, and leave unstaged + untracked changes in the worktree.
	writeTestFile(t, filepath.Join(dir, "tracked.txt"), "staged-v2\n")
	runTestGit(t, dir, "add", "tracked.txt")
	realIndexBefore, err := os.ReadFile(filepath.Join(dir, ".git", "index"))
	if err != nil {
		t.Fatal(err)
	}
	headBefore := runTestGit(t, dir, "rev-parse", "HEAD")
	branchBefore := runTestGit(t, dir, "branch", "--show-current")

	writeTestFile(t, filepath.Join(dir, "tracked.txt"), "worktree-v3\n")
	writeTestFile(t, filepath.Join(dir, "untracked.txt"), "new-file\n")

	snap, err := Capture(ctx, dir, "sess-1", "turn-1", Options{})
	if err != nil {
		t.Fatalf("Capture failed: %v", err)
	}
	if snap.Ref != "refs/controlrod/snapshots/sess-1/turn-1" {
		t.Fatalf("unexpected ref %q", snap.Ref)
	}
	if snap.UntrackedFiles != 1 {
		t.Fatalf("expected 1 untracked file, got %d", snap.UntrackedFiles)
	}

	// Verify user's branch, HEAD, real index, and stash are untouched.
	if got := runTestGit(t, dir, "rev-parse", "HEAD"); got != headBefore {
		t.Fatalf("HEAD changed: %s != %s", got, headBefore)
	}
	if got := runTestGit(t, dir, "branch", "--show-current"); got != branchBefore {
		t.Fatalf("branch changed: %s != %s", got, branchBefore)
	}
	if got := runTestGit(t, dir, "stash", "list"); got != stashBefore {
		t.Fatalf("stash changed: %q != %q", got, stashBefore)
	}
	realIndexAfter, err := os.ReadFile(filepath.Join(dir, ".git", "index"))
	if err != nil {
		t.Fatal(err)
	}
	if string(realIndexAfter) != string(realIndexBefore) {
		t.Fatalf("real .git/index was modified")
	}

	// Verify snapshot commit has 2 parents (HEAD + index commit) and preserves worktree content.
	parents := strings.Fields(runTestGit(t, dir, "rev-list", "--parents", "-n", "1", snap.CommitSHA))
	if len(parents) != 3 {
		t.Fatalf("expected commit + 2 parents, got %v", parents)
	}
	if parents[1] != headBefore {
		t.Fatalf("parent 1 = %s, want HEAD %s", parents[1], headBefore)
	}
	if parents[2] != snap.IndexCommitSHA {
		t.Fatalf("parent 2 = %s, want index commit %s", parents[2], snap.IndexCommitSHA)
	}
	if got := runTestGit(t, dir, "show", snap.Ref+":tracked.txt"); got != "worktree-v3" {
		t.Fatalf("snapshot tracked.txt = %q, want worktree-v3", got)
	}
	if got := runTestGit(t, dir, "show", snap.Ref+":untracked.txt"); got != "new-file" {
		t.Fatalf("snapshot untracked.txt = %q, want new-file", got)
	}
	if got := runTestGit(t, dir, "show", snap.IndexCommitSHA+":tracked.txt"); got != "staged-v2" {
		t.Fatalf("index parent tracked.txt = %q, want staged-v2", got)
	}
}

func TestRefusesNestedRepository(t *testing.T) {
	ctx := context.Background()
	dir := initTestRepo(t)

	nested := filepath.Join(dir, "subrepo")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	runTestGit(t, nested, "init", "-b", "main")

	_, err := Capture(ctx, dir, "sess-1", "turn-1", Options{})
	if !errors.Is(err, ErrNestedRepository) {
		t.Fatalf("expected ErrNestedRepository, got %v", err)
	}
}

func TestEnforcesUntrackedCaps(t *testing.T) {
	ctx := context.Background()
	dir := initTestRepo(t)

	writeTestFile(t, filepath.Join(dir, "a.txt"), "12345")
	writeTestFile(t, filepath.Join(dir, "b.txt"), "67890")

	// Count cap exceeded.
	if _, err := Capture(ctx, dir, "sess-1", "turn-1", Options{MaxUntrackedFiles: 1}); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge for file count, got %v", err)
	}

	// Byte cap exceeded.
	if _, err := Capture(ctx, dir, "sess-1", "turn-2", Options{MaxUntrackedFiles: 10, MaxUntrackedBytes: 9}); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("expected ErrTooLarge for byte cap, got %v", err)
	}

	// Within caps succeeds.
	if _, err := Capture(ctx, dir, "sess-1", "turn-3", Options{MaxUntrackedFiles: 2, MaxUntrackedBytes: 10}); err != nil {
		t.Fatalf("expected Capture within caps to succeed, got %v", err)
	}
}

func TestPlanApplyAndTamperDetection(t *testing.T) {
	ctx := context.Background()
	dir := initTestRepo(t)

	writeTestFile(t, filepath.Join(dir, "tracked.txt"), "turn1-state\n")
	writeTestFile(t, filepath.Join(dir, "only-in-turn1.txt"), "keep-in-snap\n")
	snap, err := Capture(ctx, dir, "sess-2", "turn-1", Options{})
	if err != nil {
		t.Fatal(err)
	}

	// Mutate worktree after snapshot.
	writeTestFile(t, filepath.Join(dir, "tracked.txt"), "bad-edit\n")
	writeTestFile(t, filepath.Join(dir, "extra-after-snap.txt"), "remove-me\n")
	if err := os.Remove(filepath.Join(dir, "only-in-turn1.txt")); err != nil {
		t.Fatal(err)
	}

	plan, err := Plan(ctx, dir, snap.Ref, Options{})
	if err != nil {
		t.Fatalf("Plan failed: %v", err)
	}
	if len(plan.PlanID) != 16 {
		t.Fatalf("expected 16-char PlanID, got %q", plan.PlanID)
	}
	if len(plan.Changes) == 0 {
		t.Fatalf("expected non-empty plan changes")
	}

	// Tampered PlanID must be refused.
	tampered := plan
	tampered.PlanID = "0000000000000000"
	if _, err := Apply(ctx, dir, tampered, ApplyOptions{}); !errors.Is(err, ErrPlanTampered) {
		t.Fatalf("expected ErrPlanTampered for forged PlanID, got %v", err)
	}

	// Mutating worktree after Plan invalidates PlanID.
	writeTestFile(t, filepath.Join(dir, "late-edit.txt"), "surprise\n")
	if _, err := Apply(ctx, dir, plan, ApplyOptions{}); !errors.Is(err, ErrPlanTampered) {
		t.Fatalf("expected ErrPlanTampered after post-plan mutation, got %v", err)
	}

	// Re-plan and apply cleanly with explicit BeforeRollbackRef.
	plan2, err := Plan(ctx, dir, snap.Ref, Options{})
	if err != nil {
		t.Fatal(err)
	}
	beforeRef := RefPrefix + "sess-2/before-rollback-1"
	res, err := Apply(ctx, dir, plan2, ApplyOptions{BeforeRollbackRef: beforeRef})
	if err != nil {
		t.Fatalf("Apply failed: %v", err)
	}
	if res.BeforeRollbackRef != beforeRef {
		t.Fatalf("unexpected BeforeRollbackRef %q", res.BeforeRollbackRef)
	}

	// BeforeRollbackRef must preserve the pre-rollback state ("bad-edit" + "late-edit.txt").
	if got := runTestGit(t, dir, "show", beforeRef+":tracked.txt"); got != "bad-edit" {
		t.Fatalf("BeforeRollbackRef tracked.txt = %q, want bad-edit", got)
	}
	if got := runTestGit(t, dir, "show", beforeRef+":late-edit.txt"); got != "surprise" {
		t.Fatalf("BeforeRollbackRef late-edit.txt = %q, want surprise", got)
	}

	// Worktree must now match snap.
	data, err := os.ReadFile(filepath.Join(dir, "tracked.txt"))
	if err != nil || string(data) != "turn1-state\n" {
		t.Fatalf("restored tracked.txt = %q, err=%v", string(data), err)
	}
	data, err = os.ReadFile(filepath.Join(dir, "only-in-turn1.txt"))
	if err != nil || string(data) != "keep-in-snap\n" {
		t.Fatalf("restored only-in-turn1.txt = %q, err=%v", string(data), err)
	}
	if _, err := os.Stat(filepath.Join(dir, "extra-after-snap.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected extra-after-snap.txt to be removed, err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "late-edit.txt")); !os.IsNotExist(err) {
		t.Fatalf("expected late-edit.txt to be removed, err=%v", err)
	}
}

func TestHardenedGitIgnoresInheritedGitEnvAndHooks(t *testing.T) {
	ctx := context.Background()
	dir := initTestRepo(t)

	// Poison inherited GIT_* env vars and add a malicious repo hook.
	t.Setenv("GIT_INDEX_FILE", "/nonexistent/poison-index")
	t.Setenv("GIT_DIR", "/nonexistent/poison-git-dir")
	t.Setenv("GIT_WORK_TREE", "/nonexistent/poison-work-tree")

	marker := filepath.Join(dir, "hook-ran")
	hookPath := filepath.Join(dir, ".git", "hooks", "pre-commit")
	writeTestFile(t, hookPath, "#!/bin/sh\ntouch "+marker+"\nexit 1\n")
	if err := os.Chmod(hookPath, 0o755); err != nil {
		t.Fatal(err)
	}

	if _, err := Capture(ctx, dir, "sess-3", "turn-1", Options{}); err != nil {
		t.Fatalf("Capture failed with poisoned env/hooks: %v", err)
	}
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatalf("repo hook should not have executed")
	}
}
