package gitworktree

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

const (
	discardDirName    = ".discarded"
	initializingLabel = "initializing"
)

var (
	// ErrBranchCheckedOutElsewhere is returned when the requested branch is
	// already checked out in another registered worktree.
	ErrBranchCheckedOutElsewhere = errors.New("branch is already checked out in another worktree")
	// ErrPathOccupied is returned when the target worktree path exists on disk
	// and is not a provable orphan of the target repository.
	ErrPathOccupied = errors.New("worktree path is occupied")
	// ErrWorktreeLocked is returned when a worktree holds an operator lock
	// (any lock other than a stale "initializing" lock).
	ErrWorktreeLocked = errors.New("worktree is locked by an operator")
	// ErrDirtyWorktree is returned when Destroy detects uncommitted or untracked
	// changes after the atomic rename and rolls back via undiscard.
	ErrDirtyWorktree = errors.New("worktree has uncommitted or untracked changes")
	// ErrBranchExists is returned when CreateBranch is requested for an existing
	// branch that diverges from BaseRef.
	ErrBranchExists = errors.New("branch already exists")
	// ErrUnsafePath is returned when a worktree path escapes ManagedRoot or
	// traverses through a symlink.
	ErrUnsafePath = errors.New("worktree path is outside managed root")
)

// CreateOptions configures Manager.Create.
type CreateOptions struct {
	RepoPath            string
	WorktreePath        string
	Branch              string
	BaseRef             string
	CreateBranch        bool
	ReuseExistingBranch bool
	Detached            bool
}

// DestroyOptions configures Manager.Destroy.
type DestroyOptions struct {
	RepoPath     string
	WorktreePath string
	Force        bool
}

// Worktree describes a managed git worktree.
type Worktree struct {
	Path     string
	Branch   string
	RepoPath string
}

// Manager creates, validates, and tears down git worktrees under a single
// canonical managed root directory.
type Manager struct {
	managedRoot string

	mu               sync.Mutex
	repoLocks        map[string]*sync.Mutex
	inFlightDiscards map[string]bool

	discardSeq atomic.Uint64
	wg         sync.WaitGroup
	now        func() time.Time
}

// NewManager initializes a Manager rooted at managedRoot.
func NewManager(managedRoot string) (*Manager, error) {
	if managedRoot == "" {
		return nil, errors.New("gitworktree: managed root is required")
	}
	if err := os.MkdirAll(managedRoot, 0o700); err != nil {
		return nil, err
	}
	canonicalRoot, err := physicalAbs(managedRoot)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(canonicalRoot, discardDirName), 0o700); err != nil {
		return nil, err
	}
	return &Manager{
		managedRoot:      canonicalRoot,
		repoLocks:        map[string]*sync.Mutex{},
		inFlightDiscards: map[string]bool{},
		now:              time.Now,
	}, nil
}

// ManagedRoot returns the canonical physical path of the manager's root.
func (m *Manager) ManagedRoot() string {
	return m.managedRoot
}

// Wait blocks until all background async unlink goroutines started by Destroy finish.
func (m *Manager) Wait() {
	m.wg.Wait()
}

func (m *Manager) discardedDir() string {
	return filepath.Join(m.managedRoot, discardDirName)
}

// repoTeardownLock returns the per-canonical-repo mutex serializing worktree
// create and teardown operations for repoPath.
func (m *Manager) repoTeardownLock(ctx context.Context, repoPath string) (*sync.Mutex, string, error) {
	canonicalRepo, err := physicalAbs(repoPath)
	if err != nil {
		return nil, "", err
	}
	key := canonicalRepo
	if commonDir, err := resolveGitCommonDir(ctx, canonicalRepo); err == nil && commonDir != "" {
		if realCommon, err := physicalAbs(commonDir); err == nil {
			key = realCommon
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	mu, ok := m.repoLocks[key]
	if !ok {
		mu = &sync.Mutex{}
		m.repoLocks[key] = mu
	}
	return mu, canonicalRepo, nil
}

// validateManagedPath resolves worktreePath and ensures it stays strictly
// inside m.managedRoot without symlink escapes.
func (m *Manager) validateManagedPath(worktreePath string) (string, error) {
	if worktreePath == "" {
		return "", fmt.Errorf("%w: empty path", ErrUnsafePath)
	}
	candidate := worktreePath
	if !filepath.IsAbs(candidate) {
		candidate = filepath.Join(m.managedRoot, candidate)
	}
	absCandidate, err := filepath.Abs(candidate)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnsafePath, err)
	}
	absCandidate = filepath.Clean(absCandidate)

	// Refuse if the target path itself already exists as a symlink.
	if info, err := os.Lstat(absCandidate); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return "", fmt.Errorf("%w: target is a symlink", ErrUnsafePath)
		}
	} else if !errors.Is(err, fs.ErrNotExist) {
		return "", err
	}

	// Verify no existing path component between managedRoot and absCandidate is a symlink
	// that escapes managedRoot, and check containment on canonical physical paths.
	resolved, err := physicalAbs(absCandidate)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUnsafePath, err)
	}
	if !isStrictlyUnder(m.managedRoot, resolved) {
		return "", fmt.Errorf("%w: escapes managed root", ErrUnsafePath)
	}
	discardRoot := m.discardedDir()
	if resolved == discardRoot || isStrictlyUnder(discardRoot, resolved) {
		return "", fmt.Errorf("%w: inside .discarded", ErrUnsafePath)
	}
	return resolved, nil
}

func isStrictlyUnder(parent, child string) bool {
	rel, err := filepath.Rel(parent, child)
	if err != nil {
		return false
	}
	if rel == "." || rel == ".." {
		return false
	}
	return !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func resolveGitCommonDir(ctx context.Context, repoDir string) (string, error) {
	out, err := runHardenedGit(ctx, repoDir, "rev-parse", "--path-format=absolute", "--git-common-dir")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(out.stdout), nil
}

type worktreeEntry struct {
	Path       string
	Head       string
	Branch     string
	Detached   bool
	Bare       bool
	Locked     bool
	LockReason string
	Prunable   bool
}

func listWorktrees(ctx context.Context, repoDir string) ([]worktreeEntry, error) {
	out, err := runHardenedGit(ctx, repoDir, "worktree", "list", "--porcelain", "-z")
	if err != nil {
		return nil, &GitFailureError{Op: "worktree-list", Cause: ClassifyGitError(err, out.stderr)}
	}
	tokens := strings.Split(out.stdout, "\x00")
	var entries []worktreeEntry
	var cur *worktreeEntry
	flush := func() {
		if cur != nil {
			entries = append(entries, *cur)
			cur = nil
		}
	}
	for _, tok := range tokens {
		if tok == "" {
			flush()
			continue
		}
		if strings.HasPrefix(tok, "worktree ") {
			flush()
			cur = &worktreeEntry{Path: strings.TrimPrefix(tok, "worktree ")}
			continue
		}
		if cur == nil {
			continue
		}
		switch {
		case strings.HasPrefix(tok, "HEAD "):
			cur.Head = strings.TrimPrefix(tok, "HEAD ")
		case strings.HasPrefix(tok, "branch "):
			cur.Branch = strings.TrimPrefix(tok, "branch ")
		case tok == "detached":
			cur.Detached = true
		case tok == "bare":
			cur.Bare = true
		case tok == "locked":
			cur.Locked = true
		case strings.HasPrefix(tok, "locked "):
			cur.Locked = true
			cur.LockReason = strings.TrimPrefix(tok, "locked ")
		case tok == "prunable", strings.HasPrefix(tok, "prunable "):
			cur.Prunable = true
		}
	}
	flush()
	return entries, nil
}

func isInitializingLock(reason string) bool {
	trimmed := strings.TrimSpace(reason)
	return trimmed == initializingLabel || strings.HasPrefix(trimmed, initializingLabel+":")
}

// Create provisions a new git worktree inside m.managedRoot.
func (m *Manager) Create(ctx context.Context, opts CreateOptions) (*Worktree, error) {
	if opts.RepoPath == "" {
		return nil, errors.New("gitworktree: repo path is required")
	}
	if !opts.Detached && opts.Branch == "" {
		return nil, errors.New("gitworktree: branch is required unless Detached is true")
	}
	targetPath, err := m.validateManagedPath(opts.WorktreePath)
	if err != nil {
		return nil, err
	}

	mu, canonicalRepo, err := m.repoTeardownLock(ctx, opts.RepoPath)
	if err != nil {
		return nil, err
	}
	mu.Lock()
	defer mu.Unlock()

	commonDirRaw, err := resolveGitCommonDir(ctx, canonicalRepo)
	if err != nil {
		return nil, &GitFailureError{Op: "rev-parse", Cause: CauseNotARepo}
	}
	commonDir, err := physicalAbs(commonDirRaw)
	if err != nil {
		return nil, err
	}

	if !opts.Detached {
		if _, ok := (DefaultBranchResolver{}).validateBranch(ctx, canonicalRepo, opts.Branch); !ok {
			return nil, fmt.Errorf("%w: invalid branch name", ErrUnsafePath)
		}
	}
	if opts.BaseRef != "" && strings.HasPrefix(opts.BaseRef, "-") {
		return nil, fmt.Errorf("%w: invalid base ref", ErrUnsafePath)
	}

	// Upfront check across all registered worktrees.
	entries, err := listWorktrees(ctx, canonicalRepo)
	if err != nil {
		return nil, err
	}
	branchRef := "refs/heads/" + opts.Branch
	for _, entry := range entries {
		entryReal, rerr := physicalAbs(entry.Path)
		if rerr != nil {
			entryReal = filepath.Clean(entry.Path)
		}
		if !opts.Detached && entry.Branch == branchRef && entryReal != targetPath {
			return nil, ErrBranchCheckedOutElsewhere
		}
		if entryReal == targetPath && entry.Locked && !isInitializingLock(entry.LockReason) {
			return nil, ErrWorktreeLocked
		}
	}

	// Inspect <common-dir>/worktrees admin directories for locks targeting targetPath.
	liftedInitializing, err := m.liftInitializingLocksForTarget(commonDir, targetPath)
	if err != nil {
		return nil, err
	}

	// Check if targetPath already exists on disk: detect provable orphans vs unknown/active dirs.
	if err := m.handleExistingTarget(targetPath, commonDir, liftedInitializing); err != nil {
		return nil, err
	}

	// Prune stale admin entries (operator-locked entries remain protected by git).
	if out, perr := runHardenedGit(ctx, canonicalRepo, "worktree", "prune"); perr != nil {
		return nil, &GitFailureError{Op: "worktree-prune", Cause: ClassifyGitError(perr, out.stderr)}
	}

	if err := os.MkdirAll(filepath.Dir(targetPath), 0o700); err != nil {
		return nil, err
	}

	if err := m.addWorktree(ctx, canonicalRepo, targetPath, opts); err != nil {
		return nil, err
	}

	// Unlock the initializing lock now that creation succeeded.
	if out, uerr := runHardenedGit(ctx, canonicalRepo, "worktree", "unlock", "--", targetPath); uerr != nil {
		return nil, &GitFailureError{Op: "worktree-unlock", Cause: ClassifyGitError(uerr, out.stderr)}
	}

	return &Worktree{
		Path:     targetPath,
		Branch:   opts.Branch,
		RepoPath: canonicalRepo,
	}, nil
}

func (m *Manager) liftInitializingLocksForTarget(commonDir, targetPath string) (bool, error) {
	wtAdminRoot := filepath.Join(commonDir, "worktrees")
	dirEntries, err := os.ReadDir(wtAdminRoot)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return false, nil
		}
		return false, err
	}
	targetGitFile := filepath.Join(targetPath, ".git")
	lifted := false
	for _, de := range dirEntries {
		if !de.IsDir() {
			continue
		}
		adminDir := filepath.Join(wtAdminRoot, de.Name())
		gdBytes, err := os.ReadFile(filepath.Join(adminDir, "gitdir"))
		if err != nil {
			continue
		}
		gdPath := strings.TrimSpace(string(gdBytes))
		if gdPath == "" {
			continue
		}
		if !filepath.IsAbs(gdPath) {
			gdPath = filepath.Join(adminDir, gdPath)
		}
		gdReal, rerr := physicalAbs(gdPath)
		if rerr != nil {
			gdReal = filepath.Clean(gdPath)
		}
		if gdReal != targetGitFile {
			continue
		}

		lockPath := filepath.Join(adminDir, "locked")
		lockBytes, lerr := os.ReadFile(lockPath)
		if lerr != nil {
			if errors.Is(lerr, fs.ErrNotExist) {
				continue
			}
			return false, lerr
		}
		if !isInitializingLock(string(lockBytes)) {
			return false, ErrWorktreeLocked
		}
		if rerr := os.Remove(lockPath); rerr != nil && !errors.Is(rerr, fs.ErrNotExist) {
			return false, rerr
		}
		lifted = true
	}
	return lifted, nil
}

func (m *Manager) handleExistingTarget(targetPath, commonDir string, hadInitializingLock bool) error {
	info, err := os.Lstat(targetPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return ErrUnsafePath
	}
	if !info.IsDir() {
		return ErrPathOccupied
	}

	orphan, locked, err := isProvableOrphan(targetPath, commonDir, hadInitializingLock)
	if err != nil {
		return err
	}
	if locked {
		return ErrWorktreeLocked
	}
	if !orphan {
		return ErrPathOccupied
	}

	// Move aside as .orphaned-<ts> (with monotonic suffix if needed) inside target's parent.
	parent := filepath.Dir(targetPath)
	base := filepath.Base(targetPath)
	ts := m.now().UnixNano()
	aside := filepath.Join(parent, fmt.Sprintf("%s.orphaned-%d", base, ts))
	if _, serr := os.Lstat(aside); serr == nil {
		aside = filepath.Join(parent, fmt.Sprintf("%s.orphaned-%d-%d", base, ts, m.discardSeq.Add(1)))
	}
	return os.Rename(targetPath, aside)
}

func isProvableOrphan(targetPath, commonDir string, hadInitializingLock bool) (orphan bool, locked bool, err error) {
	dotGitPath := filepath.Join(targetPath, ".git")
	dotGitInfo, err := os.Lstat(dotGitPath)
	if err != nil {
		// No .git file -> unknown directory, fail closed.
		return false, false, nil
	}
	if dotGitInfo.Mode()&os.ModeSymlink != 0 || !dotGitInfo.Mode().IsRegular() {
		// Standalone .git dir or symlink -> not a worktree orphan, fail closed.
		return false, false, nil
	}
	raw, err := os.ReadFile(dotGitPath)
	if err != nil {
		return false, false, nil
	}
	var gitdirRaw string
	for _, line := range strings.Split(string(raw), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "gitdir:") {
			gitdirRaw = strings.TrimSpace(strings.TrimPrefix(line, "gitdir:"))
			break
		}
	}
	if gitdirRaw == "" {
		return false, false, nil
	}
	if !filepath.IsAbs(gitdirRaw) {
		gitdirRaw = filepath.Join(targetPath, gitdirRaw)
	}
	adminDir, err := physicalAbs(gitdirRaw)
	if err != nil {
		return false, false, nil
	}

	worktreesRoot := filepath.Join(commonDir, "worktrees")
	if !isStrictlyUnder(worktreesRoot, adminDir) {
		// Points outside this repository's <common-dir>/worktrees -> fail closed.
		return false, false, nil
	}

	// Check adminDir state inside <common-dir>/worktrees.
	adminInfo, err := os.Lstat(adminDir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			// .git proves it belonged to this repo's worktrees dir, which no longer exists.
			return true, false, nil
		}
		return false, false, err
	}
	if !adminInfo.IsDir() {
		return true, false, nil
	}

	// Respect operator locks unconditionally.
	if lockBytes, lerr := os.ReadFile(filepath.Join(adminDir, "locked")); lerr == nil {
		if !isInitializingLock(string(lockBytes)) {
			return false, true, nil
		}
		return true, false, nil
	}
	if hadInitializingLock {
		return true, false, nil
	}

	// Check reverse link <adminDir>/gitdir.
	revRaw, err := os.ReadFile(filepath.Join(adminDir, "gitdir"))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return true, false, nil
		}
		return false, false, err
	}
	revPath := strings.TrimSpace(string(revRaw))
	if !filepath.IsAbs(revPath) {
		revPath = filepath.Join(adminDir, revPath)
	}
	revReal, rerr := physicalAbs(revPath)
	if rerr != nil {
		revReal = filepath.Clean(revPath)
	}
	if revReal != dotGitPath {
		// Admin entry belongs to another path -> this directory is an orphan.
		return true, false, nil
	}

	// Both links match and no initializing lock: active registered worktree.
	return false, false, nil
}

func (m *Manager) addWorktree(ctx context.Context, repoDir, targetPath string, opts CreateOptions) error {
	if opts.Detached {
		args := []string{"worktree", "add", "--lock", "--reason", initializingLabel, "--detach", "--", targetPath}
		if opts.BaseRef != "" {
			args = append(args, opts.BaseRef)
		}
		out, err := runHardenedGit(ctx, repoDir, args...)
		if err != nil {
			return &GitFailureError{Op: "worktree-add", Cause: ClassifyGitError(err, out.stderr)}
		}
		return nil
	}

	if !opts.CreateBranch {
		out, err := runHardenedGit(ctx, repoDir, "worktree", "add", "--lock", "--reason", initializingLabel, "--", targetPath, opts.Branch)
		if err != nil {
			cause := ClassifyGitError(err, out.stderr)
			if cause == CauseBranchExists {
				// Re-check if checked out elsewhere.
				if entries, lerr := listWorktrees(ctx, repoDir); lerr == nil {
					branchRef := "refs/heads/" + opts.Branch
					for _, e := range entries {
						if e.Branch == branchRef {
							return ErrBranchCheckedOutElsewhere
						}
					}
				}
			}
			return &GitFailureError{Op: "worktree-add", Cause: cause}
		}
		return nil
	}

	// CreateBranch == true: check if branch already exists before invoking -b.
	branchExisted, err := branchRefExists(ctx, repoDir, opts.Branch)
	if err != nil {
		return err
	}
	if branchExisted {
		return m.attachExistingBranchOnRetry(ctx, repoDir, targetPath, opts)
	}

	args := []string{"worktree", "add", "--lock", "--reason", initializingLabel, "-b", opts.Branch, "--", targetPath}
	if opts.BaseRef != "" {
		args = append(args, opts.BaseRef)
	}
	out, err := runHardenedGit(ctx, repoDir, args...)
	if err == nil {
		return nil
	}

	cause := ClassifyGitError(err, out.stderr)
	if cause == CauseBranchExists {
		// Handle the `-b` branch-already-created retry trap: if the branch now exists
		// and isn't checked out elsewhere, attach it safely without `-b`.
		if existsNow, eerr := branchRefExists(ctx, repoDir, opts.Branch); eerr == nil && existsNow {
			return m.attachExistingBranchOnRetry(ctx, repoDir, targetPath, opts)
		}
	}
	return &GitFailureError{Op: "worktree-add", Cause: cause}
}

func (m *Manager) attachExistingBranchOnRetry(ctx context.Context, repoDir, targetPath string, opts CreateOptions) error {
	entries, err := listWorktrees(ctx, repoDir)
	if err != nil {
		return err
	}
	branchRef := "refs/heads/" + opts.Branch
	for _, e := range entries {
		if e.Branch == branchRef {
			return ErrBranchCheckedOutElsewhere
		}
	}

	if !opts.ReuseExistingBranch && opts.BaseRef != "" {
		bSHA, bErr := revParseCommit(ctx, repoDir, branchRef)
		baseSHA, rErr := revParseCommit(ctx, repoDir, opts.BaseRef)
		if bErr != nil || rErr != nil || bSHA != baseSHA {
			return ErrBranchExists
		}
	}

	out, err := runHardenedGit(ctx, repoDir, "worktree", "add", "--lock", "--reason", initializingLabel, "--", targetPath, opts.Branch)
	if err != nil {
		return &GitFailureError{Op: "worktree-add", Cause: ClassifyGitError(err, out.stderr)}
	}
	return nil
}

func branchRefExists(ctx context.Context, repoDir, branch string) (bool, error) {
	out, err := runHardenedGit(ctx, repoDir, "show-ref", "--verify", "--quiet", "refs/heads/"+branch)
	if err == nil {
		return true, nil
	}
	// Exit status 1 with empty stderr means the ref simply does not exist.
	if strings.TrimSpace(out.stderr) == "" {
		return false, nil
	}
	return false, &GitFailureError{Op: "show-ref", Cause: ClassifyGitError(err, out.stderr)}
}

func revParseCommit(ctx context.Context, repoDir, ref string) (string, error) {
	out, err := runHardenedGit(ctx, repoDir, "rev-parse", "--verify", ref+"^{commit}")
	if err != nil {
		return "", &GitFailureError{Op: "rev-parse", Cause: ClassifyGitError(err, out.stderr)}
	}
	return strings.TrimSpace(out.stdout), nil
}

// Destroy tears down a managed worktree:
//  1. Acquires per-canonical-repo teardown serialization lock
//  2. Respects operator locks (lifts ONLY "initializing" locks)
//  3. O(1) atomic rename into <managedRoot>/.discarded/<name>-<ns>-<i>
//  4. Post-rename cleanliness check with undiscard rollback if dirty (unless Force)
//  5. Runs `git worktree prune`
//  6. Dispatches async background unlink via RemoveAllWithRetry
func (m *Manager) Destroy(ctx context.Context, opts DestroyOptions) error {
	if opts.RepoPath == "" {
		return errors.New("gitworktree: repo path is required")
	}
	targetPath, err := m.validateManagedPath(opts.WorktreePath)
	if err != nil {
		return err
	}

	mu, canonicalRepo, err := m.repoTeardownLock(ctx, opts.RepoPath)
	if err != nil {
		return err
	}
	mu.Lock()
	defer mu.Unlock()

	commonDirRaw, err := resolveGitCommonDir(ctx, canonicalRepo)
	if err != nil {
		return &GitFailureError{Op: "rev-parse", Cause: CauseNotARepo}
	}
	commonDir, err := physicalAbs(commonDirRaw)
	if err != nil {
		return err
	}

	if _, err := m.liftInitializingLocksForTarget(commonDir, targetPath); err != nil {
		return err
	}

	info, err := os.Lstat(targetPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			if out, perr := runHardenedGit(ctx, canonicalRepo, "worktree", "prune"); perr != nil {
				return &GitFailureError{Op: "worktree-prune", Cause: ClassifyGitError(perr, out.stderr)}
			}
			return nil
		}
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return ErrUnsafePath
	}

	discardRoot := m.discardedDir()
	if err := os.MkdirAll(discardRoot, 0o700); err != nil {
		return err
	}
	seq := m.discardSeq.Add(1)
	ns := m.now().UnixNano()
	discardPath := filepath.Join(discardRoot, fmt.Sprintf("%s-%d-%d", filepath.Base(targetPath), ns, seq))

	m.markInFlightDiscard(discardPath, true)
	if err := os.Rename(targetPath, discardPath); err != nil {
		m.markInFlightDiscard(discardPath, false)
		return err
	}

	if !opts.Force {
		dirty, checkErr := isWorktreeDirty(ctx, discardPath)
		if checkErr != nil || dirty {
			// Roll back via undiscard.
			if rbErr := os.Rename(discardPath, targetPath); rbErr != nil {
				m.markInFlightDiscard(discardPath, false)
				if checkErr != nil {
					return fmt.Errorf("worktree cleanliness check failed (%w) and undiscard rollback failed (%v)", checkErr, rbErr)
				}
				return fmt.Errorf("%w: undiscard rollback failed (%v)", ErrDirtyWorktree, rbErr)
			}
			m.markInFlightDiscard(discardPath, false)
			if checkErr != nil {
				return checkErr
			}
			return ErrDirtyWorktree
		}
	}

	if out, perr := runHardenedGit(ctx, canonicalRepo, "worktree", "prune"); perr != nil {
		// Prune failure shouldn't lose awareness of the error; targetPath is already discarded.
		m.markInFlightDiscard(discardPath, false)
		m.spawnBackgroundRemove(discardPath)
		return &GitFailureError{Op: "worktree-prune", Cause: ClassifyGitError(perr, out.stderr)}
	}

	m.markInFlightDiscard(discardPath, false)
	m.spawnBackgroundRemove(discardPath)
	return nil
}

func (m *Manager) markInFlightDiscard(discardPath string, active bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if active {
		m.inFlightDiscards[discardPath] = true
	} else {
		delete(m.inFlightDiscards, discardPath)
	}
}

func (m *Manager) isInFlightDiscard(discardPath string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.inFlightDiscards[discardPath]
}

func (m *Manager) spawnBackgroundRemove(discardPath string) {
	m.wg.Add(1)
	go func() {
		defer m.wg.Done()
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		_ = RemoveAllWithRetry(ctx, discardPath)
	}()
}

func isWorktreeDirty(ctx context.Context, worktreePath string) (bool, error) {
	out, err := runHardenedGit(ctx, worktreePath, "status", "--porcelain")
	if err != nil {
		return false, &GitFailureError{Op: "status", Cause: ClassifyGitError(err, out.stderr)}
	}
	return len(bytes.TrimSpace([]byte(out.stdout))) > 0, nil
}

// SweepDiscarded removes leftover entries inside <managedRoot>/.discarded at boot,
// repairing read-only permissions safely via os.OpenRoot. Symlinks are unlinked
// without being followed, and active in-flight discards are skipped.
func (m *Manager) SweepDiscarded(ctx context.Context) error {
	discardRoot := m.discardedDir()
	entries, err := os.ReadDir(discardRoot)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return err
	}

	var errs []error
	for _, entry := range entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		name := entry.Name()
		if name == "." || name == ".." {
			continue
		}
		childPath := filepath.Join(discardRoot, name)
		if m.isInFlightDiscard(childPath) {
			continue
		}
		info, lerr := os.Lstat(childPath)
		if lerr != nil {
			if errors.Is(lerr, fs.ErrNotExist) {
				continue
			}
			errs = append(errs, lerr)
			continue
		}
		if info.Mode()&os.ModeSymlink != 0 {
			if rerr := os.Remove(childPath); rerr != nil && !errors.Is(rerr, fs.ErrNotExist) {
				errs = append(errs, rerr)
			}
			continue
		}
		if rerr := RemoveAllWithRetry(ctx, childPath); rerr != nil {
			errs = append(errs, rerr)
		}
	}
	return errors.Join(errs...)
}
