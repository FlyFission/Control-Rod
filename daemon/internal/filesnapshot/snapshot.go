// Package filesnapshot captures and restores hidden-ref Git worktree snapshots
// using a disposable GIT_INDEX_FILE without modifying the user's branch,
// real index, or git stash.
package filesnapshot

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	// RefPrefix is the hidden Git ref namespace used for Control Rod snapshots.
	RefPrefix = "refs/controlrod/snapshots/"

	// DefaultMaxUntrackedFiles is the default cap on untracked non-ignored files.
	DefaultMaxUntrackedFiles = 10_000

	// DefaultMaxUntrackedBytes is the default cap on total untracked non-ignored bytes.
	DefaultMaxUntrackedBytes int64 = 100 << 20 // 100 MiB
)

var (
	// ErrNestedRepository indicates a nested .git entry or gitlink inside the worktree.
	ErrNestedRepository = errors.New("filesnapshot: nested git repository refused")

	// ErrTooLarge indicates untracked files exceed the configured count or byte cap.
	ErrTooLarge = errors.New("filesnapshot: untracked files exceed cap")

	// ErrPlanTampered indicates the worktree, HEAD, index, or plan changed since Plan was built.
	ErrPlanTampered = errors.New("filesnapshot: rollback plan digest mismatch (worktree or plan changed)")

	// ErrInvalidRef indicates an invalid session, turn, or snapshot reference name.
	ErrInvalidRef = errors.New("filesnapshot: invalid snapshot reference")

	// ErrNotGitRepo indicates the target directory is not a Git repository with a valid HEAD.
	ErrNotGitRepo = errors.New("filesnapshot: not a git repository with a valid HEAD")
)

var safeSegmentRe = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

// Options configures snapshot capture, planning, and rollback application.
type Options struct {
	// MaxUntrackedFiles overrides DefaultMaxUntrackedFiles when > 0.
	MaxUntrackedFiles int
	// MaxUntrackedBytes overrides DefaultMaxUntrackedBytes when > 0.
	MaxUntrackedBytes int64
	// Now overrides time.Now when set.
	Now func() time.Time
}

// ApplyOptions configures rollback application behavior.
type ApplyOptions struct {
	Options
	// BeforeRollbackRef overrides the default safety ref captured before apply.
	// When non-empty, it must start with RefPrefix and have valid segments.
	BeforeRollbackRef string
	// RestoreIndex restores the repository's real index to the snapshot's
	// recorded index parent tree (if the snapshot has a second parent).
	RestoreIndex bool
}

// Snapshot describes a captured hidden-ref Git worktree snapshot.
type Snapshot struct {
	Ref            string
	CommitSHA      string
	TreeSHA        string
	HeadSHA        string
	IndexCommitSHA string
	IndexTreeSHA   string
	Session        string
	Turn           string
	UntrackedFiles int
	UntrackedBytes int64
	CreatedAt      time.Time
}

// FileChange describes a single path difference between the current worktree and target snapshot.
type FileChange struct {
	Status string
	Path   string
}

// RollbackPlan binds a target snapshot to the observed repository state via PlanID.
type RollbackPlan struct {
	PlanID              string
	SnapshotRef         string
	SnapshotCommit      string
	SnapshotTree        string
	SnapshotIndexTree   string
	HeadSHA             string
	CurrentWorktreeTree string
	CurrentIndexTree    string
	Changes             []FileChange
}

// ApplyResult records the outcome of applying a RollbackPlan.
type ApplyResult struct {
	PlanID               string
	AppliedSnapshot      string
	BeforeRollbackRef    string
	BeforeRollbackCommit string
}

func (o Options) maxFiles() int {
	if o.MaxUntrackedFiles > 0 {
		return o.MaxUntrackedFiles
	}
	return DefaultMaxUntrackedFiles
}

func (o Options) maxBytes() int64 {
	if o.MaxUntrackedBytes > 0 {
		return o.MaxUntrackedBytes
	}
	return DefaultMaxUntrackedBytes
}

func (o Options) now() time.Time {
	if o.Now != nil {
		return o.Now()
	}
	return time.Now().UTC()
}

// SnapshotRef returns the hidden Git ref for a (session, turn) pair.
func SnapshotRef(session, turn string) (string, error) {
	if !validSegment(session) || !validSegment(turn) {
		return "", fmt.Errorf("%w: invalid session %q or turn %q", ErrInvalidRef, session, turn)
	}
	return RefPrefix + session + "/" + turn, nil
}

func validSegment(s string) bool {
	if s == "." || s == ".." || strings.Contains(s, "..") || strings.HasSuffix(s, ".lock") {
		return false
	}
	return safeSegmentRe.MatchString(s)
}

func validateFullRef(ref string) error {
	if !strings.HasPrefix(ref, RefPrefix) {
		return fmt.Errorf("%w: ref %q must start with %s", ErrInvalidRef, ref, RefPrefix)
	}
	rest := strings.TrimPrefix(ref, RefPrefix)
	parts := strings.Split(rest, "/")
	if len(parts) < 2 {
		return fmt.Errorf("%w: ref %q must include session and turn", ErrInvalidRef, ref)
	}
	for _, p := range parts {
		if !validSegment(p) {
			return fmt.Errorf("%w: invalid segment %q in ref %q", ErrInvalidRef, p, ref)
		}
	}
	return nil
}

// ComputePlanID returns the 16-character lowercase hex prefix of SHA-256 over
// the length-delimited tuple (snapshot, head, currentWorktree, currentIndex).
func ComputePlanID(snapshot, head, currentWorktree, currentIndex string) string {
	h := sha256.New()
	for _, field := range []string{snapshot, head, currentWorktree, currentIndex} {
		_, _ = fmt.Fprintf(h, "%d:%s\x00", len(field), field)
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

// hardenedGitArgs returns configuration flags prepended to every git invocation.
func hardenedGitArgs() []string {
	return []string{
		"-c", "core.hooksPath=" + os.DevNull,
		"-c", "core.fsmonitor=false",
		"-c", "protocol.ext.allow=never",
		"-c", "protocol.file.allow=never",
		"-c", "submodule.recurse=false",
		"-c", "commit.gpgsign=false",
		"-c", "tag.gpgsign=false",
		"-c", "gc.auto=0",
	}
}

// scrubbedGitEnv strips all inherited GIT_* variables and optionally sets an
// explicit disposable GIT_INDEX_FILE.
func scrubbedGitEnv(env []string, indexFile string) []string {
	out := make([]string, 0, len(env)+1)
	for _, kv := range env {
		k, _, _ := strings.Cut(kv, "=")
		if strings.HasPrefix(k, "GIT_") {
			continue
		}
		out = append(out, kv)
	}
	if indexFile != "" {
		out = append(out, "GIT_INDEX_FILE="+indexFile)
	}
	return out
}

func runGit(ctx context.Context, dir, indexFile string, extraConfig []string, args ...string) ([]byte, error) {
	fullArgs := append(hardenedGitArgs(), extraConfig...)
	fullArgs = append(fullArgs, args...)
	cmd := exec.CommandContext(ctx, "git", fullArgs...)
	cmd.Dir = dir
	cmd.Env = scrubbedGitEnv(os.Environ(), indexFile)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			return nil, fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
		}
		return nil, fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, msg)
	}
	return stdout.Bytes(), nil
}

func verifyGitRepo(ctx context.Context, dir string) (string, error) {
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return "", fmt.Errorf("%w: %s is not a directory", ErrNotGitRepo, dir)
	}
	out, err := runGit(ctx, dir, "", nil, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrNotGitRepo, err)
	}
	top := strings.TrimSpace(string(out))
	absDir, err := filepath.EvalSymlinks(dir)
	if err != nil {
		absDir, _ = filepath.Abs(dir)
	}
	absTop, err := filepath.EvalSymlinks(top)
	if err != nil {
		absTop = top
	}
	if absDir != absTop {
		return "", fmt.Errorf("%w: %s is not repository root %s", ErrNotGitRepo, absDir, absTop)
	}
	headOut, err := runGit(ctx, dir, "", nil, "rev-parse", "--verify", "HEAD")
	if err != nil {
		return "", fmt.Errorf("%w: HEAD does not resolve: %v", ErrNotGitRepo, err)
	}
	return strings.TrimSpace(string(headOut)), nil
}

func checkNoNestedRepositories(ctx context.Context, worktreeDir string) error {
	err := filepath.WalkDir(worktreeDir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if path == worktreeDir {
			return nil
		}
		rel, err := filepath.Rel(worktreeDir, path)
		if err != nil {
			return err
		}
		if rel == ".git" {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.Name() == ".git" {
			return fmt.Errorf("%w: %s", ErrNestedRepository, filepath.ToSlash(rel))
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Also reject gitlink (160000) entries recorded in the repository index.
	stageOut, err := runGit(ctx, worktreeDir, "", nil, "ls-files", "--stage", "-z")
	if err != nil {
		return err
	}
	for _, entry := range bytes.Split(stageOut, []byte{0}) {
		if len(entry) == 0 {
			continue
		}
		if bytes.HasPrefix(entry, []byte("160000 ")) {
			_, pathPart, _ := bytes.Cut(entry, []byte("\t"))
			return fmt.Errorf("%w: gitlink %s", ErrNestedRepository, string(pathPart))
		}
	}
	return nil
}

func checkUntrackedCaps(ctx context.Context, worktreeDir string, opts Options) (int, int64, error) {
	out, err := runGit(ctx, worktreeDir, "", nil, "ls-files", "--others", "--exclude-standard", "-z")
	if err != nil {
		return 0, 0, err
	}
	maxFiles := opts.maxFiles()
	maxBytes := opts.maxBytes()

	var count int
	var totalBytes int64
	for _, raw := range bytes.Split(out, []byte{0}) {
		if len(raw) == 0 {
			continue
		}
		count++
		if count > maxFiles {
			return count, totalBytes, fmt.Errorf("%w: untracked file count exceeds %d", ErrTooLarge, maxFiles)
		}
		full := filepath.Join(worktreeDir, filepath.FromSlash(string(raw)))
		info, err := os.Lstat(full)
		if err != nil {
			return count, totalBytes, err
		}
		if info.Mode().IsRegular() {
			totalBytes += info.Size()
			if totalBytes > maxBytes {
				return count, totalBytes, fmt.Errorf("%w: untracked bytes exceed %d", ErrTooLarge, maxBytes)
			}
		}
	}
	return count, totalBytes, nil
}

func readRealIndexTree(ctx context.Context, worktreeDir, tmpDir string) (string, error) {
	idxPathOut, err := runGit(ctx, worktreeDir, "", nil, "rev-parse", "--git-path", "index")
	if err != nil {
		return "", err
	}
	idxPath := strings.TrimSpace(string(idxPathOut))
	if !filepath.IsAbs(idxPath) {
		idxPath = filepath.Join(worktreeDir, idxPath)
	}
	src, err := os.Open(idxPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			treeOut, treeErr := runGit(ctx, worktreeDir, "", nil, "rev-parse", "--verify", "HEAD^{tree}")
			if treeErr != nil {
				return "", treeErr
			}
			return strings.TrimSpace(string(treeOut)), nil
		}
		return "", err
	}
	defer src.Close()

	tmpIdx := filepath.Join(tmpDir, "real-copy.index")
	dst, err := os.OpenFile(tmpIdx, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(dst, src)
	closeErr := dst.Close()
	if err := errors.Join(copyErr, closeErr); err != nil {
		return "", err
	}
	out, err := runGit(ctx, worktreeDir, tmpIdx, nil, "write-tree")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func captureWorktreeTree(ctx context.Context, worktreeDir, tmpIdx string) (string, error) {
	if _, err := runGit(ctx, worktreeDir, tmpIdx, nil, "read-tree", "HEAD"); err != nil {
		return "", err
	}
	if _, err := runGit(ctx, worktreeDir, tmpIdx, nil, "add", "-A"); err != nil {
		return "", err
	}
	out, err := runGit(ctx, worktreeDir, tmpIdx, nil, "write-tree")
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func commitTree(ctx context.Context, worktreeDir, treeSHA string, parents []string, msg string) (string, error) {
	args := []string{"commit-tree", treeSHA}
	for _, p := range parents {
		if p != "" {
			args = append(args, "-p", p)
		}
	}
	args = append(args, "-m", msg)
	identityCfg := []string{
		"-c", "user.name=Control Rod",
		"-c", "user.email=controlrod@local",
	}
	out, err := runGit(ctx, worktreeDir, "", identityCfg, args...)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// Capture takes a hidden-ref snapshot at refs/controlrod/snapshots/<session>/<turn>
// without touching the user's branch, real index, or git stash.
func Capture(ctx context.Context, worktreeDir, session, turn string, opts Options) (Snapshot, error) {
	ref, err := SnapshotRef(session, turn)
	if err != nil {
		return Snapshot{}, err
	}
	return captureToRef(ctx, worktreeDir, ref, session, turn, opts)
}

func captureToRef(ctx context.Context, worktreeDir, ref, session, turn string, opts Options) (Snapshot, error) {
	if err := validateFullRef(ref); err != nil {
		return Snapshot{}, err
	}
	headSHA, err := verifyGitRepo(ctx, worktreeDir)
	if err != nil {
		return Snapshot{}, err
	}
	if err := checkNoNestedRepositories(ctx, worktreeDir); err != nil {
		return Snapshot{}, err
	}
	untrackedFiles, untrackedBytes, err := checkUntrackedCaps(ctx, worktreeDir, opts)
	if err != nil {
		return Snapshot{}, err
	}

	tmpDir, err := os.MkdirTemp("", "cr-filesnapshot-*")
	if err != nil {
		return Snapshot{}, err
	}
	defer os.RemoveAll(tmpDir)

	indexTreeSHA, err := readRealIndexTree(ctx, worktreeDir, tmpDir)
	if err != nil {
		return Snapshot{}, err
	}
	indexCommitSHA, err := commitTree(ctx, worktreeDir, indexTreeSHA, []string{headSHA}, "controlrod index snapshot")
	if err != nil {
		return Snapshot{}, err
	}

	snapIndex := filepath.Join(tmpDir, "snap.index")
	worktreeTreeSHA, err := captureWorktreeTree(ctx, worktreeDir, snapIndex)
	if err != nil {
		return Snapshot{}, err
	}

	snapCommitSHA, err := commitTree(
		ctx,
		worktreeDir,
		worktreeTreeSHA,
		[]string{headSHA, indexCommitSHA},
		fmt.Sprintf("controlrod snapshot %s/%s", session, turn),
	)
	if err != nil {
		return Snapshot{}, err
	}

	if _, err := runGit(ctx, worktreeDir, "", nil, "update-ref", ref, snapCommitSHA); err != nil {
		return Snapshot{}, err
	}

	return Snapshot{
		Ref:            ref,
		CommitSHA:      snapCommitSHA,
		TreeSHA:        worktreeTreeSHA,
		HeadSHA:        headSHA,
		IndexCommitSHA: indexCommitSHA,
		IndexTreeSHA:   indexTreeSHA,
		Session:        session,
		Turn:           turn,
		UntrackedFiles: untrackedFiles,
		UntrackedBytes: untrackedBytes,
		CreatedAt:      opts.now(),
	}, nil
}

// Plan builds a tamper-checked RollbackPlan from a hidden snapshot ref (or commit SHA).
func Plan(ctx context.Context, worktreeDir, snapshotRef string, opts Options) (RollbackPlan, error) {
	if strings.TrimSpace(snapshotRef) == "" {
		return RollbackPlan{}, fmt.Errorf("%w: empty snapshot reference", ErrInvalidRef)
	}
	if strings.HasPrefix(snapshotRef, "refs/") {
		if err := validateFullRef(snapshotRef); err != nil {
			return RollbackPlan{}, err
		}
	}
	headSHA, err := verifyGitRepo(ctx, worktreeDir)
	if err != nil {
		return RollbackPlan{}, err
	}
	if err := checkNoNestedRepositories(ctx, worktreeDir); err != nil {
		return RollbackPlan{}, err
	}

	snapCommitOut, err := runGit(ctx, worktreeDir, "", nil, "rev-parse", "--verify", snapshotRef+"^{commit}")
	if err != nil {
		return RollbackPlan{}, fmt.Errorf("%w: %v", ErrInvalidRef, err)
	}
	snapCommit := strings.TrimSpace(string(snapCommitOut))

	snapTreeOut, err := runGit(ctx, worktreeDir, "", nil, "rev-parse", "--verify", snapCommit+"^{tree}")
	if err != nil {
		return RollbackPlan{}, err
	}
	snapTree := strings.TrimSpace(string(snapTreeOut))

	var snapIndexTree string
	if idxTreeOut, err := runGit(ctx, worktreeDir, "", nil, "rev-parse", "--verify", snapCommit+"^2^{tree}"); err == nil {
		snapIndexTree = strings.TrimSpace(string(idxTreeOut))
	}

	tmpDir, err := os.MkdirTemp("", "cr-filesnapshot-plan-*")
	if err != nil {
		return RollbackPlan{}, err
	}
	defer os.RemoveAll(tmpDir)

	currentIndexTree, err := readRealIndexTree(ctx, worktreeDir, tmpDir)
	if err != nil {
		return RollbackPlan{}, err
	}
	currentWorktreeTree, err := captureWorktreeTree(ctx, worktreeDir, filepath.Join(tmpDir, "plan.index"))
	if err != nil {
		return RollbackPlan{}, err
	}

	changes, err := diffTrees(ctx, worktreeDir, currentWorktreeTree, snapTree)
	if err != nil {
		return RollbackPlan{}, err
	}

	planID := ComputePlanID(snapCommit, headSHA, currentWorktreeTree, currentIndexTree)
	return RollbackPlan{
		PlanID:              planID,
		SnapshotRef:         snapshotRef,
		SnapshotCommit:      snapCommit,
		SnapshotTree:        snapTree,
		SnapshotIndexTree:   snapIndexTree,
		HeadSHA:             headSHA,
		CurrentWorktreeTree: currentWorktreeTree,
		CurrentIndexTree:    currentIndexTree,
		Changes:             changes,
	}, nil
}

func diffTrees(ctx context.Context, worktreeDir, fromTree, toTree string) ([]FileChange, error) {
	out, err := runGit(ctx, worktreeDir, "", nil, "diff-tree", "-r", "--name-status", "-z", fromTree, toTree)
	if err != nil {
		return nil, err
	}
	fields := bytes.Split(out, []byte{0})
	var changes []FileChange
	for i := 0; i+1 < len(fields); i += 2 {
		status := string(fields[i])
		if status == "" {
			break
		}
		path := string(fields[i+1])
		changes = append(changes, FileChange{Status: status, Path: path})
	}
	return changes, nil
}

// Apply verifies PlanID against the live repository state, captures a safety
// snapshot at BeforeRollbackRef, and restores the worktree to plan.SnapshotTree.
func Apply(ctx context.Context, worktreeDir string, plan RollbackPlan, opts ApplyOptions) (ApplyResult, error) {
	if plan.PlanID == "" || plan.SnapshotCommit == "" || plan.SnapshotTree == "" {
		return ApplyResult{}, fmt.Errorf("%w: incomplete rollback plan", ErrPlanTampered)
	}
	headSHA, err := verifyGitRepo(ctx, worktreeDir)
	if err != nil {
		return ApplyResult{}, err
	}
	if err := checkNoNestedRepositories(ctx, worktreeDir); err != nil {
		return ApplyResult{}, err
	}

	tmpDir, err := os.MkdirTemp("", "cr-filesnapshot-apply-*")
	if err != nil {
		return ApplyResult{}, err
	}
	defer os.RemoveAll(tmpDir)

	liveIndexTree, err := readRealIndexTree(ctx, worktreeDir, tmpDir)
	if err != nil {
		return ApplyResult{}, err
	}
	verifyIdx := filepath.Join(tmpDir, "verify.index")
	liveWorktreeTree, err := captureWorktreeTree(ctx, worktreeDir, verifyIdx)
	if err != nil {
		return ApplyResult{}, err
	}

	expectedPlanID := ComputePlanID(plan.SnapshotCommit, headSHA, liveWorktreeTree, liveIndexTree)
	if expectedPlanID != plan.PlanID {
		return ApplyResult{}, ErrPlanTampered
	}

	beforeRef := opts.BeforeRollbackRef
	if beforeRef == "" {
		beforeRef = RefPrefix + "before-rollback/" + strconv.FormatInt(opts.now().UnixNano(), 10)
	}
	if err := validateFullRef(beforeRef); err != nil {
		return ApplyResult{}, err
	}

	beforeSnap, err := captureToRef(ctx, worktreeDir, beforeRef, "before-rollback", filepath.Base(beforeRef), opts.Options)
	if err != nil {
		return ApplyResult{}, fmt.Errorf("capture BeforeRollbackRef: %w", err)
	}

	if _, err := runGit(ctx, worktreeDir, verifyIdx, nil, "read-tree", "--reset", "-u", plan.SnapshotTree); err != nil {
		return ApplyResult{}, err
	}

	if opts.RestoreIndex && plan.SnapshotIndexTree != "" {
		if _, err := runGit(ctx, worktreeDir, "", nil, "read-tree", plan.SnapshotIndexTree); err != nil {
			return ApplyResult{}, err
		}
	}

	return ApplyResult{
		PlanID:               plan.PlanID,
		AppliedSnapshot:      plan.SnapshotCommit,
		BeforeRollbackRef:    beforeRef,
		BeforeRollbackCommit: beforeSnap.CommitSHA,
	}, nil
}
