// Package reviewgateway prepares isolated neutral-root runtime environments
// and content-addressed manifest artifacts for independent reviewer runs.
//
// Invariants enforced by this package:
//   - The project checkout is NEVER the reviewer's working directory; every
//     reviewer receives a private neutral root (<dataDir>/reviewer-runtime/<reviewerID>)
//     created with mode 0o700 and an empty disabled-git-hooks directory so
//     repository git hooks cannot execute.
//   - Every task prompt file must reside inside TaskPromptRoot and is verified
//     through an os.OpenRoot handle so neither ".." traversal nor symlink
//     redirection can escape the prompt root.
//   - Manifests bind Control Rod custody metadata (PackageID, Revision,
//     ReleaseManifestDigest, DataLane) and are written content-addressed under
//     <manifestsDir>/<sha256>.json using O_CREATE|O_EXCL at mode 0o600, with
//     byte-for-byte verification on idempotent re-writes to detect tampering.
//   - Host-trusted or unsandboxed fallback is explicitly refused: RequireConfinement
//     must always be true.
package reviewgateway

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gowebpki/jcs"
)

var (
	// ErrInvalidManifest reports a schema, custody, or confinement violation in a Manifest.
	ErrInvalidManifest = errors.New("invalid reviewer manifest")
	// ErrConfinementRequired reports an attempt to disable confinement or request a host-trusted fallback.
	ErrConfinementRequired = errors.New("reviewer confinement is required: unsandboxed fallback refused")
	// ErrPromptEscape reports a TaskPromptFile that escapes or fails to resolve inside TaskPromptRoot.
	ErrPromptEscape = errors.New("task prompt file escapes task prompt root")
	// ErrWorkspaceCollision reports a WorkspacePath that overlaps the neutral reviewer runtime root.
	ErrWorkspaceCollision = errors.New("workspace checkout path collides with neutral reviewer runtime")
	// ErrManifestTampered reports an existing content-addressed manifest file whose bytes do not match.
	ErrManifestTampered = errors.New("content-addressed manifest content mismatch")
)

// Task describes one pull-request review assignment bound into a reviewer manifest.
type Task struct {
	RunID          string `json:"run_id"`
	PRURL          string `json:"pr_url"`
	TargetSHA      string `json:"target_sha"`
	TaskPromptFile string `json:"task_prompt_file"`
}

// Manifest binds Control Rod custody metadata and reviewer tasks for an isolated review run.
type Manifest struct {
	ReviewerID            string `json:"reviewer_id"`
	WorkerSessionID       string `json:"worker_session_id"`
	PackageID             string `json:"package_id"`
	Revision              int    `json:"revision"`
	ReleaseManifestDigest string `json:"release_manifest_digest"`
	DataLane              string `json:"data_lane"`
	WorkspacePath         string `json:"workspace_path"`
	TaskPromptRoot        string `json:"task_prompt_root"`
	Tasks                 []Task `json:"tasks"`
	RequireConfinement    bool   `json:"require_confinement"`
	AllowHostFallback     bool   `json:"allow_host_fallback,omitempty"`
}

// Environment holds the resolved paths and content-addressed manifest digest of a prepared reviewer runtime.
type Environment struct {
	Root             string
	WorkspaceDir     string
	ConfigDir        string
	StateDir         string
	CacheDir         string
	TmpDir           string
	ManifestsDir     string
	DisabledHooksDir string
	ManifestPath     string
	ManifestDigest   string
}

type canonicalTask struct {
	RunID          string `json:"run_id"`
	PRURL          string `json:"pr_url"`
	TargetSHA      string `json:"target_sha"`
	TaskPromptFile string `json:"task_prompt_file"`
}

type canonicalManifest struct {
	ReviewerID            string          `json:"reviewer_id"`
	WorkerSessionID       string          `json:"worker_session_id"`
	PackageID             string          `json:"package_id"`
	Revision              int             `json:"revision"`
	ReleaseManifestDigest string          `json:"release_manifest_digest"`
	DataLane              string          `json:"data_lane"`
	WorkspacePath         string          `json:"workspace_path"`
	TaskPromptRoot        string          `json:"task_prompt_root"`
	Tasks                 []canonicalTask `json:"tasks"`
	RequireConfinement    bool            `json:"require_confinement"`
}

// ValidateManifest checks all Manifest invariants, custody bindings, PR URLs, hex SHAs,
// confinement requirements, and os.OpenRoot-confined TaskPromptFile paths.
func ValidateManifest(m Manifest) error {
	_, err := normalizeAndValidateManifest(m)
	return err
}

func normalizeAndValidateManifest(m Manifest) (canonicalManifest, error) {
	if !m.RequireConfinement || m.AllowHostFallback {
		return canonicalManifest{}, fmt.Errorf("%w: RequireConfinement must be true and host fallback is prohibited", ErrConfinementRequired)
	}
	if !validSafeSegment(m.ReviewerID) {
		return canonicalManifest{}, fmt.Errorf("%w: invalid reviewer_id %q", ErrInvalidManifest, m.ReviewerID)
	}
	if !validNonEmptyToken(m.WorkerSessionID) {
		return canonicalManifest{}, fmt.Errorf("%w: invalid worker_session_id", ErrInvalidManifest)
	}
	if !validNonEmptyToken(m.PackageID) {
		return canonicalManifest{}, fmt.Errorf("%w: missing or invalid package_id", ErrInvalidManifest)
	}
	if m.Revision < 1 {
		return canonicalManifest{}, fmt.Errorf("%w: revision must be >= 1", ErrInvalidManifest)
	}
	if !validHexSHA(m.ReleaseManifestDigest, 64, 64) {
		return canonicalManifest{}, fmt.Errorf("%w: release_manifest_digest must be 64 lowercase hex characters", ErrInvalidManifest)
	}
	if m.DataLane != "public" && m.DataLane != "internal" && m.DataLane != "restricted" {
		return canonicalManifest{}, fmt.Errorf("%w: invalid data_lane %q", ErrInvalidManifest, m.DataLane)
	}
	if strings.TrimSpace(m.WorkspacePath) == "" || !utf8.ValidString(m.WorkspacePath) || strings.ContainsRune(m.WorkspacePath, 0) {
		return canonicalManifest{}, fmt.Errorf("%w: missing or invalid workspace_path", ErrInvalidManifest)
	}
	workspaceAbs, err := filepath.Abs(m.WorkspacePath)
	if err != nil {
		return canonicalManifest{}, fmt.Errorf("%w: resolve workspace_path: %v", ErrInvalidManifest, err)
	}
	if strings.TrimSpace(m.TaskPromptRoot) == "" || !utf8.ValidString(m.TaskPromptRoot) || strings.ContainsRune(m.TaskPromptRoot, 0) {
		return canonicalManifest{}, fmt.Errorf("%w: missing or invalid task_prompt_root", ErrInvalidManifest)
	}
	promptRootAbs, err := filepath.Abs(m.TaskPromptRoot)
	if err != nil {
		return canonicalManifest{}, fmt.Errorf("%w: resolve task_prompt_root: %v", ErrInvalidManifest, err)
	}
	promptRootInfo, err := os.Lstat(promptRootAbs)
	if err != nil {
		return canonicalManifest{}, fmt.Errorf("%w: stat task_prompt_root: %v", ErrInvalidManifest, err)
	}
	if !promptRootInfo.IsDir() || promptRootInfo.Mode()&os.ModeSymlink != 0 {
		return canonicalManifest{}, fmt.Errorf("%w: task_prompt_root must be a real directory", ErrInvalidManifest)
	}
	if len(m.Tasks) == 0 {
		return canonicalManifest{}, fmt.Errorf("%w: tasks must not be empty", ErrInvalidManifest)
	}

	rootHandle, err := os.OpenRoot(promptRootAbs)
	if err != nil {
		return canonicalManifest{}, fmt.Errorf("%w: open task_prompt_root: %v", ErrInvalidManifest, err)
	}
	defer func() { _ = rootHandle.Close() }()

	normTasks := make([]canonicalTask, 0, len(m.Tasks))
	for i, task := range m.Tasks {
		if !validNonEmptyToken(task.RunID) {
			return canonicalManifest{}, fmt.Errorf("%w: tasks[%d]: invalid run_id", ErrInvalidManifest, i)
		}
		if err := validateGitHubPRURL(task.PRURL); err != nil {
			return canonicalManifest{}, fmt.Errorf("%w: tasks[%d]: %v", ErrInvalidManifest, i, err)
		}
		if !validHexSHA(task.TargetSHA, 7, 64) {
			return canonicalManifest{}, fmt.Errorf("%w: tasks[%d]: target_sha must be 7-64 lowercase hex characters", ErrInvalidManifest, i)
		}
		relPrompt, err := confinePromptFile(rootHandle, promptRootAbs, task.TaskPromptFile)
		if err != nil {
			return canonicalManifest{}, fmt.Errorf("tasks[%d]: %w", i, err)
		}
		normTasks = append(normTasks, canonicalTask{
			RunID:          task.RunID,
			PRURL:          task.PRURL,
			TargetSHA:      task.TargetSHA,
			TaskPromptFile: relPrompt,
		})
	}

	return canonicalManifest{
		ReviewerID:            m.ReviewerID,
		WorkerSessionID:       m.WorkerSessionID,
		PackageID:             m.PackageID,
		Revision:              m.Revision,
		ReleaseManifestDigest: m.ReleaseManifestDigest,
		DataLane:              m.DataLane,
		WorkspacePath:         workspaceAbs,
		TaskPromptRoot:        promptRootAbs,
		Tasks:                 normTasks,
		RequireConfinement:    true,
	}, nil
}

// PrepareEnvironment validates m, creates a private neutral reviewer root under
// <dataDir>/reviewer-runtime/<reviewerID> (mode 0o700) with isolated subdirectories,
// enforces that the repository checkout is never the reviewer's working directory,
// and writes the canonical JSON manifest content-addressed at <manifestsDir>/<sha256>.json
// with mode 0o600 using O_CREATE|O_EXCL.
func PrepareEnvironment(dataDir string, m Manifest) (*Environment, error) {
	if strings.TrimSpace(dataDir) == "" || !utf8.ValidString(dataDir) || strings.ContainsRune(dataDir, 0) {
		return nil, fmt.Errorf("%w: dataDir must be non-empty", ErrInvalidManifest)
	}
	norm, err := normalizeAndValidateManifest(m)
	if err != nil {
		return nil, err
	}

	dataDirAbs, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, fmt.Errorf("resolve dataDir: %w", err)
	}
	runtimeParent := filepath.Join(dataDirAbs, "reviewer-runtime")
	rootDir := filepath.Join(runtimeParent, norm.ReviewerID)

	env := &Environment{
		Root:             rootDir,
		WorkspaceDir:     filepath.Join(rootDir, "workspace"),
		ConfigDir:        filepath.Join(rootDir, "config"),
		StateDir:         filepath.Join(rootDir, "state"),
		CacheDir:         filepath.Join(rootDir, "cache"),
		TmpDir:           filepath.Join(rootDir, "tmp"),
		ManifestsDir:     filepath.Join(rootDir, "manifests"),
		DisabledHooksDir: filepath.Join(rootDir, "disabled-git-hooks"),
	}

	if pathsOverlap(norm.WorkspacePath, rootDir) {
		return nil, fmt.Errorf("%w: checkout %q overlaps neutral root %q", ErrWorkspaceCollision, norm.WorkspacePath, rootDir)
	}
	if checkRealpathOverlap(norm.WorkspacePath, rootDir) {
		return nil, fmt.Errorf("%w: resolved checkout %q overlaps neutral root %q", ErrWorkspaceCollision, norm.WorkspacePath, rootDir)
	}

	if err := ensurePrivateDir(runtimeParent); err != nil {
		return nil, fmt.Errorf("prepare runtime parent: %w", err)
	}
	for _, dir := range []string{
		env.Root,
		env.WorkspaceDir,
		env.ConfigDir,
		env.StateDir,
		env.CacheDir,
		env.TmpDir,
		env.ManifestsDir,
		env.DisabledHooksDir,
	} {
		if err := ensurePrivateDir(dir); err != nil {
			return nil, fmt.Errorf("prepare neutral directory %q: %w", dir, err)
		}
	}

	if err := verifyEmptyDir(env.DisabledHooksDir); err != nil {
		return nil, fmt.Errorf("verify disabled-git-hooks directory: %w", err)
	}

	rawJSON, err := json.Marshal(norm)
	if err != nil {
		return nil, fmt.Errorf("marshal manifest: %w", err)
	}
	canonicalBytes, err := jcs.Transform(rawJSON)
	if err != nil {
		return nil, fmt.Errorf("canonicalize manifest: %w", err)
	}
	sum := sha256.Sum256(canonicalBytes)
	digestHex := hex.EncodeToString(sum[:])

	manifestFilename := digestHex + ".json"
	manifestFullPath := filepath.Join(env.ManifestsDir, manifestFilename)

	if err := writeContentAddressedManifest(env.ManifestsDir, manifestFilename, canonicalBytes); err != nil {
		return nil, err
	}

	env.ManifestPath = manifestFullPath
	env.ManifestDigest = digestHex
	return env, nil
}

func writeContentAddressedManifest(manifestsDir, filename string, canonicalBytes []byte) error {
	manifestsRoot, err := os.OpenRoot(manifestsDir)
	if err != nil {
		return fmt.Errorf("open manifests root: %w", err)
	}
	defer func() { _ = manifestsRoot.Close() }()

	f, err := manifestsRoot.OpenFile(filename, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		if errors.Is(err, fs.ErrExist) {
			return verifyExistingManifest(manifestsRoot, filename, canonicalBytes)
		}
		return fmt.Errorf("create content-addressed manifest: %w", err)
	}

	n, writeErr := f.Write(canonicalBytes)
	if writeErr == nil && n != len(canonicalBytes) {
		writeErr = io.ErrShortWrite
	}
	chmodErr := f.Chmod(0o600)
	syncErr := f.Sync()
	closeErr := f.Close()
	if err := errors.Join(writeErr, chmodErr, syncErr, closeErr); err != nil {
		_ = manifestsRoot.Remove(filename)
		return fmt.Errorf("write content-addressed manifest: %w", err)
	}
	return nil
}

func verifyExistingManifest(manifestsRoot *os.Root, filename string, expected []byte) error {
	info, err := manifestsRoot.Lstat(filename)
	if err != nil {
		return fmt.Errorf("stat existing manifest: %w", err)
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("%w: existing manifest %q is not a regular file", ErrManifestTampered, filename)
	}
	if info.Mode().Perm() != 0o600 {
		return fmt.Errorf("%w: existing manifest %q has permissions %#o, want 0o600", ErrManifestTampered, filename, info.Mode().Perm())
	}
	f, err := manifestsRoot.Open(filename)
	if err != nil {
		return fmt.Errorf("open existing manifest: %w", err)
	}
	existing, readErr := io.ReadAll(f)
	closeErr := f.Close()
	if err := errors.Join(readErr, closeErr); err != nil {
		return fmt.Errorf("read existing manifest: %w", err)
	}
	if !bytes.Equal(existing, expected) {
		return fmt.Errorf("%w: existing manifest %q bytes do not match expected digest", ErrManifestTampered, filename)
	}
	return nil
}

func confinePromptFile(rootHandle *os.Root, promptRootAbs, promptPath string) (string, error) {
	if strings.TrimSpace(promptPath) == "" || !utf8.ValidString(promptPath) || strings.ContainsAny(promptPath, "\\\x00") {
		return "", fmt.Errorf("%w: invalid prompt path %q", ErrPromptEscape, promptPath)
	}

	var rel string
	if filepath.IsAbs(promptPath) {
		for _, part := range strings.Split(promptPath, "/") {
			if part == ".." {
				return "", fmt.Errorf("%w: dot-dot segment in prompt path %q", ErrPromptEscape, promptPath)
			}
		}
		computedRel, err := filepath.Rel(promptRootAbs, promptPath)
		if err != nil {
			return "", fmt.Errorf("%w: %v", ErrPromptEscape, err)
		}
		rel = filepath.ToSlash(computedRel)
	} else {
		for _, part := range strings.Split(promptPath, "/") {
			if part == ".." || part == "." || part == "" {
				return "", fmt.Errorf("%w: non-canonical relative prompt path %q", ErrPromptEscape, promptPath)
			}
		}
		rel = promptPath
	}

	if rel == "." || rel == "" || strings.HasPrefix(rel, "../") || rel == ".." || !fs.ValidPath(rel) {
		return "", fmt.Errorf("%w: path %q escapes root", ErrPromptEscape, promptPath)
	}

	info, err := rootHandle.Lstat(rel)
	if err != nil {
		return "", fmt.Errorf("%w: lstat %q inside root: %v", ErrPromptEscape, rel, err)
	}
	if !info.Mode().IsRegular() {
		return "", fmt.Errorf("%w: prompt file %q is not a regular file", ErrPromptEscape, rel)
	}

	f, err := rootHandle.Open(rel)
	if err != nil {
		return "", fmt.Errorf("%w: open %q inside root: %v", ErrPromptEscape, rel, err)
	}
	fInfo, statErr := f.Stat()
	closeErr := f.Close()
	if err := errors.Join(statErr, closeErr); err != nil {
		return "", fmt.Errorf("%w: verify opened prompt file %q: %v", ErrPromptEscape, rel, err)
	}
	if !fInfo.Mode().IsRegular() || !os.SameFile(info, fInfo) {
		return "", fmt.Errorf("%w: prompt file %q changed or is not regular", ErrPromptEscape, rel)
	}
	return rel, nil
}

func ensurePrivateDir(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	info, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("%w: %q is not a real directory", ErrInvalidManifest, dir)
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return err
	}
	return nil
}

func verifyEmptyDir(dir string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	if len(entries) != 0 {
		return fmt.Errorf("%w: disabled-git-hooks directory %q is not empty", ErrInvalidManifest, dir)
	}
	return nil
}

func pathsOverlap(a, b string) bool {
	cleanA := filepath.Clean(a)
	cleanB := filepath.Clean(b)
	if cleanA == cleanB {
		return true
	}
	prefixA := cleanA + string(filepath.Separator)
	prefixB := cleanB + string(filepath.Separator)
	return strings.HasPrefix(cleanB, prefixA) || strings.HasPrefix(cleanA, prefixB)
}

func checkRealpathOverlap(workspaceAbs, rootDir string) bool {
	realWork, errW := filepath.EvalSymlinks(workspaceAbs)
	realRoot, errR := filepath.EvalSymlinks(rootDir)
	if errW == nil && errR == nil {
		return pathsOverlap(realWork, realRoot)
	}
	if errW == nil {
		return pathsOverlap(realWork, rootDir)
	}
	return false
}

func validateGitHubPRURL(raw string) error {
	if strings.TrimSpace(raw) != raw || raw == "" || !utf8.ValidString(raw) || strings.ContainsAny(raw, " \t\r\n\x00?#\\") {
		return fmt.Errorf("malformed github PR URL %q", raw)
	}
	u, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("parse github PR URL %q: %w", raw, err)
	}
	if u.Scheme != "https" || u.Host != "github.com" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Opaque != "" {
		return fmt.Errorf("github PR URL %q must use https://github.com/<owner>/<repo>/pull/<n>", raw)
	}
	if u.RawPath != "" && u.RawPath != u.Path {
		return fmt.Errorf("github PR URL %q must not contain encoded path traversal", raw)
	}
	parts := strings.Split(strings.TrimPrefix(u.Path, "/"), "/")
	if len(parts) != 4 || parts[2] != "pull" {
		return fmt.Errorf("github PR URL %q must match /<owner>/<repo>/pull/<n>", raw)
	}
	owner, repo, pullNum := parts[0], parts[1], parts[3]
	if !validGitHubIdentifier(owner) || !validGitHubIdentifier(repo) || repo == "." || repo == ".." {
		return fmt.Errorf("github PR URL %q has invalid owner or repo", raw)
	}
	if !validPositiveDecimal(pullNum) {
		return fmt.Errorf("github PR URL %q has invalid pull request number %q", raw, pullNum)
	}
	return nil
}

func validGitHubIdentifier(s string) bool {
	if len(s) == 0 || len(s) > 100 || s == "." || s == ".." {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		isAlphaNum := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
		if !isAlphaNum && c != '-' && c != '_' && c != '.' {
			return false
		}
	}
	return true
}

func validPositiveDecimal(s string) bool {
	if len(s) == 0 || s[0] == '0' {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	n, err := strconv.ParseUint(s, 10, 64)
	return err == nil && n > 0
}

func validHexSHA(s string, minLen, maxLen int) bool {
	if len(s) < minLen || len(s) > maxLen {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return false
		}
	}
	return true
}

func validSafeSegment(s string) bool {
	if len(s) == 0 || len(s) > 128 || s == "." || s == ".." {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		isAlphaNum := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
		if !isAlphaNum && c != '-' && c != '_' && c != '.' {
			return false
		}
	}
	return true
}

func validNonEmptyToken(s string) bool {
	if strings.TrimSpace(s) == "" || strings.TrimSpace(s) != s || !utf8.ValidString(s) {
		return false
	}
	for _, r := range s {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	return true
}
