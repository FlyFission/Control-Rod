package gitworktree

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func initTestRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	realDir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		t.Fatal(err)
	}
	runGitCmd(t, realDir, "init", "-b", "main")
	runGitCmd(t, realDir, "config", "user.name", "Test User")
	runGitCmd(t, realDir, "config", "user.email", "test@example.com")
	if err := os.WriteFile(filepath.Join(realDir, "README.md"), []byte("hello\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGitCmd(t, realDir, "add", "README.md")
	runGitCmd(t, realDir, "commit", "-m", "initial commit")
	return realDir
}

func runGitCmd(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v in %s failed: %v\n%s", args, dir, err, string(out))
	}
	return strings.TrimSpace(string(out))
}

func TestCreateAndDestroyWorktreeWithSweepDiscarded(t *testing.T) {
	ctx := context.Background()
	repo := initTestRepo(t)
	root := t.TempDir()
	mgr, err := NewManager(root)
	if err != nil {
		t.Fatal(err)
	}

	wtPath := filepath.Join(mgr.ManagedRoot(), "wt-1")
	wt, err := mgr.Create(ctx, CreateOptions{
		RepoPath:     repo,
		WorktreePath: wtPath,
		Branch:       "feat/one",
		CreateBranch: true,
	})
	if err != nil {
		t.Fatalf("Create failed: %v", err)
	}
	if wt.Path != wtPath || wt.Branch != "feat/one" {
		t.Fatalf("unexpected worktree metadata: %+v", wt)
	}

	// Dirty non-forced Destroy must roll back via undiscard and return ErrDirtyWorktree.
	dirtyFile := filepath.Join(wtPath, "untracked.txt")
	if err := os.WriteFile(dirtyFile, []byte("dirty"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := mgr.Destroy(ctx, DestroyOptions{RepoPath: repo, WorktreePath: wtPath, Force: false}); !errors.Is(err, ErrDirtyWorktree) {
		t.Fatalf("expected ErrDirtyWorktree, got %v", err)
	}
	if _, err := os.Stat(dirtyFile); err != nil {
		t.Fatalf("expected dirty file to be restored after undiscard rollback: %v", err)
	}

	// Clean up dirty file and verify clean Destroy removes the worktree and background unlinks it.
	if err := os.Remove(dirtyFile); err != nil {
		t.Fatal(err)
	}
	if err := mgr.Destroy(ctx, DestroyOptions{RepoPath: repo, WorktreePath: wtPath, Force: false}); err != nil {
		t.Fatalf("Destroy failed: %v", err)
	}
	if _, err := os.Lstat(wtPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("worktree path still exists right after Destroy: %v", err)
	}
	mgr.Wait()

	// Seed leftover read-only and symlink entries inside .discarded and verify SweepDiscarded cleans them safely.
	discardDir := filepath.Join(mgr.ManagedRoot(), discardDirName)
	leftover := filepath.Join(discardDir, "leftover-1")
	roSub := filepath.Join(leftover, "rodir")
	if err := os.MkdirAll(roSub, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(roSub, "file.txt"), []byte("x"), 0o400); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(roSub, 0o500); err != nil {
		t.Fatal(err)
	}

	outsideVictim := filepath.Join(t.TempDir(), "victim.txt")
	if err := os.WriteFile(outsideVictim, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsideVictim, filepath.Join(discardDir, "symlink-entry")); err != nil {
		t.Fatal(err)
	}

	if err := mgr.SweepDiscarded(ctx); err != nil {
		t.Fatalf("SweepDiscarded failed: %v", err)
	}
	entries, err := os.ReadDir(discardDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected empty .discarded after SweepDiscarded, got %d entries", len(entries))
	}
	if _, err := os.Stat(outsideVictim); err != nil {
		t.Fatalf("outside symlink target was modified or deleted: %v", err)
	}
}

func TestConcurrentTeardownSerialization(t *testing.T) {
	ctx := context.Background()
	repo := initTestRepo(t)
	mgr, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	const count = 6
	paths := make([]string, count)
	for i := 0; i < count; i++ {
		p := filepath.Join(mgr.ManagedRoot(), "concurrent", string(rune('a'+i)))
		paths[i] = p
		branch := "feat/conc-" + string(rune('a'+i))
		if _, err := mgr.Create(ctx, CreateOptions{
			RepoPath:     repo,
			WorktreePath: p,
			Branch:       branch,
			CreateBranch: true,
		}); err != nil {
			t.Fatalf("Create %d failed: %v", i, err)
		}
	}

	var wg sync.WaitGroup
	errs := make(chan error, count)
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(wtPath string) {
			defer wg.Done()
			if err := mgr.Destroy(ctx, DestroyOptions{
				RepoPath:     repo,
				WorktreePath: wtPath,
				Force:        true,
			}); err != nil {
				errs <- err
			}
		}(paths[i])
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		t.Fatalf("concurrent Destroy error: %v", err)
	}
	mgr.Wait()

	listed, err := listWorktrees(ctx, repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed) != 1 {
		t.Fatalf("expected only main repo worktree remaining, got %+v", listed)
	}
}

func TestRepairRemovePermissionsAndSymlinkSafety(t *testing.T) {
	ctx := context.Background()
	base := t.TempDir()
	outside := t.TempDir()

	outsideFile := filepath.Join(outside, "secret.txt")
	if err := os.WriteFile(outsideFile, []byte("untouched"), 0o400); err != nil {
		t.Fatal(err)
	}
	outsideDir := filepath.Join(outside, "ro-outside")
	if err := os.MkdirAll(outsideDir, 0o500); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_ = os.Chmod(outsideDir, 0o700)
		_ = os.Chmod(outsideFile, 0o600)
	})

	target := filepath.Join(base, "tree")
	nested := filepath.Join(target, "a", "b")
	if err := os.MkdirAll(nested, 0o700); err != nil {
		t.Fatal(err)
	}
	nestedFile := filepath.Join(nested, "mod.cache")
	if err := os.WriteFile(nestedFile, []byte("cached"), 0o400); err != nil {
		t.Fatal(err)
	}
	// Symlinks pointing outside target must never be traversed or chmodded.
	if err := os.Symlink(outsideFile, filepath.Join(nested, "file-link")); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outsideDir, filepath.Join(target, "a", "dir-link")); err != nil {
		t.Fatal(err)
	}

	// Lock down directories to 0500 like Go module cache / Nix / Bazel trees.
	if err := os.Chmod(nested, 0o500); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(filepath.Join(target, "a"), 0o500); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(target, 0o500); err != nil {
		t.Fatal(err)
	}

	if err := RemoveAllWithRetry(ctx, target); err != nil {
		t.Fatalf("RemoveAllWithRetry failed on 0500 tree: %v", err)
	}
	if _, err := os.Lstat(target); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("target still exists after RemoveAllWithRetry: %v", err)
	}

	// Verify outside symlink targets were neither removed nor had permissions altered.
	fInfo, err := os.Lstat(outsideFile)
	if err != nil {
		t.Fatalf("outsideFile missing: %v", err)
	}
	if fInfo.Mode().Perm() != 0o400 {
		t.Fatalf("outsideFile mode changed to %o, want 0400", fInfo.Mode().Perm())
	}
	dInfo, err := os.Lstat(outsideDir)
	if err != nil {
		t.Fatalf("outsideDir missing: %v", err)
	}
	if dInfo.Mode().Perm() != 0o500 {
		t.Fatalf("outsideDir mode changed to %o, want 0500", dInfo.Mode().Perm())
	}
}

func TestOrphanedWorktreeMoveAsideVsErrPathOccupied(t *testing.T) {
	ctx := context.Background()
	repo := initTestRepo(t)
	mgr, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	// 1. Unknown occupied directory without a valid worktree .git pointer must fail closed with ErrPathOccupied.
	unknownPath := filepath.Join(mgr.ManagedRoot(), "occupied-dir")
	if err := os.MkdirAll(unknownPath, 0o700); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(unknownPath, "keep.txt")
	if err := os.WriteFile(sentinel, []byte("important"), 0o600); err != nil {
		t.Fatal(err)
	}
	_, err = mgr.Create(ctx, CreateOptions{
		RepoPath:     repo,
		WorktreePath: unknownPath,
		Branch:       "feat/occupied",
		CreateBranch: true,
	})
	if !errors.Is(err, ErrPathOccupied) {
		t.Fatalf("expected ErrPathOccupied on unknown directory, got %v", err)
	}
	if _, err := os.Stat(sentinel); err != nil {
		t.Fatalf("unknown directory contents were disturbed: %v", err)
	}

	// 2. Provable orphan worktree directory (whose .git points to <common-dir>/worktrees/<name> that was deleted)
	// must be moved aside as .orphaned-<ts> and allow Create to succeed.
	orphanPath := filepath.Join(mgr.ManagedRoot(), "orphan-wt")
	if _, err := mgr.Create(ctx, CreateOptions{
		RepoPath:     repo,
		WorktreePath: orphanPath,
		Branch:       "feat/orphan-first",
		CreateBranch: true,
	}); err != nil {
		t.Fatalf("initial Create failed: %v", err)
	}
	// Remove the repo's .git/worktrees/orphan-wt admin directory to simulate a half-pruned/crashed orphan.
	adminDir := filepath.Join(repo, ".git", "worktrees", "orphan-wt")
	if err := os.RemoveAll(adminDir); err != nil {
		t.Fatal(err)
	}

	wt, err := mgr.Create(ctx, CreateOptions{
		RepoPath:     repo,
		WorktreePath: orphanPath,
		Branch:       "feat/orphan-second",
		CreateBranch: true,
	})
	if err != nil {
		t.Fatalf("Create over provable orphan failed: %v", err)
	}
	if wt.Path != orphanPath {
		t.Fatalf("unexpected worktree path: %s", wt.Path)
	}
	matches, err := filepath.Glob(filepath.Join(mgr.ManagedRoot(), "orphan-wt.orphaned-*"))
	if err != nil || len(matches) != 1 {
		t.Fatalf("expected 1 moved-aside .orphaned-* directory, got %v (err=%v)", matches, err)
	}
}

func TestStaleInitializingLockLiftedVsOperatorLockPreserved(t *testing.T) {
	ctx := context.Background()
	repo := initTestRepo(t)
	mgr, err := NewManager(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}

	// Create a worktree and lock it with a stale "initializing" lock reason.
	wtInit := filepath.Join(mgr.ManagedRoot(), "wt-init-lock")
	if _, err := mgr.Create(ctx, CreateOptions{
		RepoPath:     repo,
		WorktreePath: wtInit,
		Branch:       "feat/init-lock",
		CreateBranch: true,
	}); err != nil {
		t.Fatal(err)
	}
	runGitCmd(t, repo, "worktree", "lock", "--reason", "initializing", wtInit)

	// Destroy should lift the stale initializing lock and succeed.
	if err := mgr.Destroy(ctx, DestroyOptions{RepoPath: repo, WorktreePath: wtInit, Force: true}); err != nil {
		t.Fatalf("Destroy should lift stale initializing lock, got: %v", err)
	}
	mgr.Wait()

	// Create another worktree and lock it with an operator lock reason.
	wtOp := filepath.Join(mgr.ManagedRoot(), "wt-op-lock")
	if _, err := mgr.Create(ctx, CreateOptions{
		RepoPath:     repo,
		WorktreePath: wtOp,
		Branch:       "feat/op-lock",
		CreateBranch: true,
	}); err != nil {
		t.Fatal(err)
	}
	runGitCmd(t, repo, "worktree", "lock", "--reason", "operator investigation", wtOp)

	// Both Destroy and Create at the same path must refuse with ErrWorktreeLocked.
	if err := mgr.Destroy(ctx, DestroyOptions{RepoPath: repo, WorktreePath: wtOp, Force: true}); !errors.Is(err, ErrWorktreeLocked) {
		t.Fatalf("expected ErrWorktreeLocked on Destroy of operator-locked worktree, got %v", err)
	}
	if _, err := mgr.Create(ctx, CreateOptions{
		RepoPath:            repo,
		WorktreePath:        wtOp,
		Branch:              "feat/op-lock",
		CreateBranch:        true,
		ReuseExistingBranch: true,
	}); !errors.Is(err, ErrWorktreeLocked) {
		t.Fatalf("expected ErrWorktreeLocked on Create over operator-locked worktree, got %v", err)
	}
}

func TestDefaultBranchResolverAuthoritativeAndErrUnresolved(t *testing.T) {
	ctx := context.Background()

	// 1. Bare local repo with only a WIP checked-out branch and no remote or local defaultbranch config
	// must NOT guess from HEAD and must return ErrUnresolved.
	wipRepo := t.TempDir()
	realWip, err := filepath.EvalSymlinks(wipRepo)
	if err != nil {
		t.Fatal(err)
	}
	runGitCmd(t, realWip, "init", "-b", "wip/experiment")
	runGitCmd(t, realWip, "config", "user.name", "Test User")
	runGitCmd(t, realWip, "config", "user.email", "test@example.com")
	if err := os.WriteFile(filepath.Join(realWip, "a.txt"), []byte("a"), 0o600); err != nil {
		t.Fatal(err)
	}
	runGitCmd(t, realWip, "add", "a.txt")
	runGitCmd(t, realWip, "commit", "-m", "wip")

	resolver := DefaultBranchResolver{
		LSRemoteTimeout: 2 * time.Second,
		DisableLSRemote: true,
	}
	if got, err := resolver.Resolve(ctx, realWip); !errors.Is(err, ErrUnresolved) {
		t.Fatalf("expected ErrUnresolved when only local HEAD exists, got branch=%q err=%v", got, err)
	}

	// 2. Explicit local config controlrod.defaultbranch resolves authoritatively.
	runGitCmd(t, realWip, "config", "--local", "controlrod.defaultbranch", "trunk")
	if got, err := resolver.Resolve(ctx, realWip); err != nil || got != "trunk" {
		t.Fatalf("expected trunk from local controlrod.defaultbranch config, got %q (%v)", got, err)
	}

	// 3. Cached refs/remotes/origin/HEAD takes precedence over local config fallback.
	runGitCmd(t, realWip, "remote", "add", "origin", "https://example.invalid/repo.git")
	runGitCmd(t, realWip, "update-ref", "refs/remotes/origin/develop", "HEAD")
	runGitCmd(t, realWip, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/develop")
	if got, err := resolver.Resolve(ctx, realWip); err != nil || got != "develop" {
		t.Fatalf("expected develop from refs/remotes/origin/HEAD, got %q (%v)", got, err)
	}
}

func TestClassifyGitFailureVocabulary(t *testing.T) {
	cases := []struct {
		name   string
		stderr string
		err    error
		want   FailureCause
	}{
		{
			name:   "branch exists",
			stderr: "fatal: a branch named 'feat/test' already exists at /secret/path/repo",
			want:   CauseBranchExists,
		},
		{
			name:   "path exists",
			stderr: "fatal: '/secret/worktree/path' already exists and is not an empty directory",
			want:   CausePathExists,
		},
		{
			name:   "locked",
			stderr: "fatal: Unable to create '/secret/repo/.git/index.lock': File exists.",
			want:   CauseLocked,
		},
		{
			name:   "permission",
			stderr: "error: open(\"/secret/file\"): Permission denied",
			want:   CausePermission,
		},
		{
			name:   "path too long",
			stderr: "fatal: cannot create directory at '/secret/...': File name too long",
			want:   CausePathTooLong,
		},
		{
			name:   "not a repo",
			stderr: "fatal: not a git repository (or any of the parent directories): .git",
			want:   CauseNotARepo,
		},
		{
			name:   "killed via stderr",
			stderr: "signal: killed",
			want:   CauseKilled,
		},
		{
			name:   "killed via context deadline",
			stderr: "some generic output",
			err:    context.DeadlineExceeded,
			want:   CauseKilled,
		},
		{
			name:   "other",
			stderr: "fatal: unexpected internal error in /secret/repo",
			want:   CauseOther,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ClassifyGitError(tc.err, tc.stderr)
			if got != tc.want {
				t.Fatalf("ClassifyGitError(%v, %q) = %q, want %q", tc.err, tc.stderr, got, tc.want)
			}
			gerr := &GitFailureError{Op: "worktree-add", Cause: got}
			if strings.Contains(gerr.Error(), "/secret") {
				t.Fatalf("GitFailureError leaked repository path: %q", gerr.Error())
			}
		})
	}
}
