package reviewgateway

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validTestFixture(t *testing.T) (string, Manifest) {
	t.Helper()
	base := t.TempDir()
	dataDir := filepath.Join(base, "data")
	checkoutDir := filepath.Join(base, "repo-checkout")
	promptRoot := filepath.Join(base, "prompts")

	if err := os.MkdirAll(checkoutDir, 0o755); err != nil {
		t.Fatalf("mkdir checkoutDir: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(promptRoot, "tasks"), 0o700); err != nil {
		t.Fatalf("mkdir promptRoot: %v", err)
	}
	promptFile := filepath.Join(promptRoot, "tasks", "review-124.md")
	if err := os.WriteFile(promptFile, []byte("Inspect committed diff only.\n"), 0o600); err != nil {
		t.Fatalf("write promptFile: %v", err)
	}

	m := Manifest{
		ReviewerID:            "rev-independent-01",
		WorkerSessionID:       "sess-99a8b7",
		PackageID:             "pkg-ao-s6-review-gateway",
		Revision:              3,
		ReleaseManifestDigest: strings.Repeat("a", 64),
		DataLane:              "internal",
		WorkspacePath:         checkoutDir,
		TaskPromptRoot:        promptRoot,
		RequireConfinement:    true,
		Tasks: []Task{
			{
				RunID:          "run-001",
				PRURL:          "https://github.com/flyfission/control-rod/pull/124",
				TargetSHA:      "0123456789abcdef0123456789abcdef01234567",
				TaskPromptFile: "tasks/review-124.md",
			},
		},
	}
	return dataDir, m
}

func TestPrepareEnvironmentCreatesNeutralRootAndSubdirsMode0700(t *testing.T) {
	t.Parallel()
	dataDir, m := validTestFixture(t)

	env, err := PrepareEnvironment(dataDir, m)
	if err != nil {
		t.Fatalf("PrepareEnvironment failed: %v", err)
	}

	expectedRoot := filepath.Join(dataDir, "reviewer-runtime", m.ReviewerID)
	if env.Root != expectedRoot {
		t.Fatalf("env.Root = %q, want %q", env.Root, expectedRoot)
	}
	if env.Root == m.WorkspacePath || strings.HasPrefix(env.WorkspaceDir, m.WorkspacePath) {
		t.Fatalf("project checkout %q must never be reviewer working directory %q", m.WorkspacePath, env.WorkspaceDir)
	}

	dirs := map[string]string{
		"Root":             env.Root,
		"WorkspaceDir":     env.WorkspaceDir,
		"ConfigDir":        env.ConfigDir,
		"StateDir":         env.StateDir,
		"CacheDir":         env.CacheDir,
		"TmpDir":           env.TmpDir,
		"ManifestsDir":     env.ManifestsDir,
		"DisabledHooksDir": env.DisabledHooksDir,
	}
	for name, dir := range dirs {
		info, err := os.Lstat(dir)
		if err != nil {
			t.Fatalf("lstat %s (%s): %v", name, dir, err)
		}
		if !info.IsDir() {
			t.Fatalf("%s (%s) is not a directory", name, dir)
		}
		if got := info.Mode().Perm(); got != 0o700 {
			t.Fatalf("%s (%s) mode = %#o, want 0o700", name, dir, got)
		}
	}

	// disabled-git-hooks must be completely empty so no repository hooks can trigger.
	entries, err := os.ReadDir(env.DisabledHooksDir)
	if err != nil {
		t.Fatalf("readdir DisabledHooksDir: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("DisabledHooksDir not empty: %d entries", len(entries))
	}
}

func TestPrepareEnvironmentRejectsCheckoutInsideNeutralRoot(t *testing.T) {
	t.Parallel()
	dataDir, m := validTestFixture(t)

	// Point WorkspacePath directly at the neutral root or a subdirectory inside it.
	neutralRoot := filepath.Join(dataDir, "reviewer-runtime", m.ReviewerID)
	cases := []string{
		neutralRoot,
		filepath.Join(neutralRoot, "workspace"),
		filepath.Join(dataDir, "reviewer-runtime"),
		dataDir,
	}
	for _, collidingPath := range cases {
		mCopy := m
		mCopy.WorkspacePath = collidingPath
		if _, err := PrepareEnvironment(dataDir, mCopy); !errors.Is(err, ErrWorkspaceCollision) {
			t.Fatalf("WorkspacePath=%q: got err=%v, want ErrWorkspaceCollision", collidingPath, err)
		}
	}
}

func TestPrepareEnvironmentContentAddressedManifestIdempotentAndTamperDetection(t *testing.T) {
	t.Parallel()
	dataDir, m := validTestFixture(t)

	env1, err := PrepareEnvironment(dataDir, m)
	if err != nil {
		t.Fatalf("first PrepareEnvironment: %v", err)
	}

	if len(env1.ManifestDigest) != 64 {
		t.Fatalf("ManifestDigest length = %d, want 64", len(env1.ManifestDigest))
	}
	wantPath := filepath.Join(env1.ManifestsDir, env1.ManifestDigest+".json")
	if env1.ManifestPath != wantPath {
		t.Fatalf("ManifestPath = %q, want %q", env1.ManifestPath, wantPath)
	}

	info, err := os.Lstat(env1.ManifestPath)
	if err != nil {
		t.Fatalf("lstat ManifestPath: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("manifest file mode = %#o, want 0o600", got)
	}

	raw, err := os.ReadFile(env1.ManifestPath)
	if err != nil {
		t.Fatalf("read ManifestPath: %v", err)
	}
	sum := sha256.Sum256(raw)
	if gotDigest := hex.EncodeToString(sum[:]); gotDigest != env1.ManifestDigest {
		t.Fatalf("sha256(manifest) = %s, want %s", gotDigest, env1.ManifestDigest)
	}
	if bytes.Contains(raw, []byte("\n")) {
		t.Fatalf("canonical JCS manifest should not contain newlines: %s", string(raw))
	}

	// Idempotent re-write with the exact same manifest must verify byte-for-byte equality and succeed.
	env2, err := PrepareEnvironment(dataDir, m)
	if err != nil {
		t.Fatalf("idempotent PrepareEnvironment failed: %v", err)
	}
	if env2.ManifestDigest != env1.ManifestDigest || env2.ManifestPath != env1.ManifestPath {
		t.Fatalf("idempotent PrepareEnvironment returned different digest/path: %+v vs %+v", env2, env1)
	}

	// Tamper with the content-addressed file on disk and verify PrepareEnvironment detects the mismatch.
	tampered := append([]byte(nil), raw...)
	tampered[len(tampered)-2] = 'X'
	if err := os.WriteFile(env1.ManifestPath, tampered, 0o600); err != nil {
		t.Fatalf("tamper manifest file: %v", err)
	}
	if _, err := PrepareEnvironment(dataDir, m); !errors.Is(err, ErrManifestTampered) {
		t.Fatalf("PrepareEnvironment on tampered manifest: got err=%v, want ErrManifestTampered", err)
	}

	// Restore content but weaken permissions to 0o644 and verify permission tamper detection.
	if err := os.WriteFile(env1.ManifestPath, raw, 0o600); err != nil {
		t.Fatalf("restore manifest file: %v", err)
	}
	if err := os.Chmod(env1.ManifestPath, 0o644); err != nil {
		t.Fatalf("chmod manifest file: %v", err)
	}
	if _, err := PrepareEnvironment(dataDir, m); !errors.Is(err, ErrManifestTampered) {
		t.Fatalf("PrepareEnvironment on 0644 manifest: got err=%v, want ErrManifestTampered", err)
	}
}

func TestValidateManifestRefusesUnsandboxedOrHostFallback(t *testing.T) {
	t.Parallel()
	dataDir, m := validTestFixture(t)

	noConfinement := m
	noConfinement.RequireConfinement = false
	if _, err := PrepareEnvironment(dataDir, noConfinement); !errors.Is(err, ErrConfinementRequired) {
		t.Fatalf("RequireConfinement=false: got err=%v, want ErrConfinementRequired", err)
	}

	hostFallback := m
	hostFallback.AllowHostFallback = true
	if _, err := PrepareEnvironment(dataDir, hostFallback); !errors.Is(err, ErrConfinementRequired) {
		t.Fatalf("AllowHostFallback=true: got err=%v, want ErrConfinementRequired", err)
	}
}

func TestValidateManifestRejectsInvalidPRURLsSHAsAndCustodyFields(t *testing.T) {
	t.Parallel()
	dataDir, baseManifest := validTestFixture(t)

	badPRURLs := []string{
		"",
		"http://github.com/flyfission/control-rod/pull/124",
		"https://gitlab.com/flyfission/control-rod/pull/124",
		"https://github.com/flyfission/control-rod/issues/124",
		"https://github.com/flyfission/control-rod/pull/0",
		"https://github.com/flyfission/control-rod/pull/01",
		"https://github.com/flyfission/control-rod/pull/-5",
		"https://github.com/flyfission/control-rod/pull/abc",
		"https://github.com/flyfission/control-rod/pull/124/files",
		"https://github.com/flyfission/control-rod/pull/124?foo=bar",
		"https://github.com/flyfission/control-rod/pull/124#discussion",
		"https://user:pass@github.com/flyfission/control-rod/pull/124",
		"https://github.com/../control-rod/pull/124",
		"https://github.com/flyfission/..%2fcontrol-rod/pull/124",
	}
	for _, badURL := range badPRURLs {
		m := baseManifest
		m.Tasks = []Task{baseManifest.Tasks[0]}
		m.Tasks[0].PRURL = badURL
		if err := ValidateManifest(m); !errors.Is(err, ErrInvalidManifest) {
			t.Fatalf("PRURL=%q: got err=%v, want ErrInvalidManifest", badURL, err)
		}
	}

	badSHAs := []string{
		"",
		"012345",                // 6 chars (< 7)
		strings.Repeat("a", 65), // 65 chars (> 64)
		"0123456789ABCDEF",      // uppercase not allowed
		"012345g",               // non-hex
		"0123456 ",              // trailing space
	}
	for _, badSHA := range badSHAs {
		m := baseManifest
		m.Tasks = []Task{baseManifest.Tasks[0]}
		m.Tasks[0].TargetSHA = badSHA
		if err := ValidateManifest(m); !errors.Is(err, ErrInvalidManifest) {
			t.Fatalf("TargetSHA=%q: got err=%v, want ErrInvalidManifest", badSHA, err)
		}
	}

	// Verify 7-char short SHA and 64-char SHA are both accepted.
	for _, goodSHA := range []string{"0123456", strings.Repeat("f", 40), strings.Repeat("b", 64)} {
		m := baseManifest
		m.Tasks = []Task{baseManifest.Tasks[0]}
		m.Tasks[0].TargetSHA = goodSHA
		if err := ValidateManifest(m); err != nil {
			t.Fatalf("valid TargetSHA=%q rejected: %v", goodSHA, err)
		}
	}

	// Missing / invalid Control Rod custody metadata cases.
	custodyMutations := []struct {
		name   string
		mutate func(*Manifest)
	}{
		{"empty ReviewerID", func(m *Manifest) { m.ReviewerID = "" }},
		{"traversal ReviewerID", func(m *Manifest) { m.ReviewerID = "../escape" }},
		{"empty WorkerSessionID", func(m *Manifest) { m.WorkerSessionID = "" }},
		{"empty PackageID", func(m *Manifest) { m.PackageID = "   " }},
		{"zero Revision", func(m *Manifest) { m.Revision = 0 }},
		{"short ReleaseManifestDigest", func(m *Manifest) { m.ReleaseManifestDigest = "abcd1234" }},
		{"uppercase ReleaseManifestDigest", func(m *Manifest) { m.ReleaseManifestDigest = strings.Repeat("A", 64) }},
		{"invalid DataLane", func(m *Manifest) { m.DataLane = "unclassified" }},
		{"empty WorkspacePath", func(m *Manifest) { m.WorkspacePath = "" }},
		{"empty TaskPromptRoot", func(m *Manifest) { m.TaskPromptRoot = "" }},
		{"empty Tasks", func(m *Manifest) { m.Tasks = nil }},
		{"empty Task RunID", func(m *Manifest) {
			m.Tasks = []Task{baseManifest.Tasks[0]}
			m.Tasks[0].RunID = ""
		}},
	}
	for _, tc := range custodyMutations {
		m := baseManifest
		tc.mutate(&m)
		if _, err := PrepareEnvironment(dataDir, m); !errors.Is(err, ErrInvalidManifest) {
			t.Fatalf("%s: got err=%v, want ErrInvalidManifest", tc.name, err)
		}
	}
}

func TestTaskPromptFileConfinementRejectsTraversalAndSymlinkEscape(t *testing.T) {
	t.Parallel()
	dataDir, baseManifest := validTestFixture(t)

	outsideFile := filepath.Join(t.TempDir(), "secret-prompt.md")
	if err := os.WriteFile(outsideFile, []byte("outside secret"), 0o600); err != nil {
		t.Fatalf("write outsideFile: %v", err)
	}

	symlinkInside := filepath.Join(baseManifest.TaskPromptRoot, "tasks", "symlink-escape.md")
	if err := os.Symlink(outsideFile, symlinkInside); err != nil {
		t.Fatalf("create symlink: %v", err)
	}

	relInsideSymlink := filepath.Join(baseManifest.TaskPromptRoot, "tasks", "relative-link.md")
	if err := os.Symlink("review-124.md", relInsideSymlink); err != nil {
		t.Fatalf("create internal symlink: %v", err)
	}

	escapeCases := []struct {
		name string
		path string
	}{
		{"empty path", ""},
		{"dot-dot relative", "../outside.md"},
		{"nested dot-dot relative", "tasks/../../outside.md"},
		{"dot-dot absolute", filepath.Join(baseManifest.TaskPromptRoot, "..", "outside.md")},
		{"outside absolute path", outsideFile},
		{"symlink escaping root", "tasks/symlink-escape.md"},
		{"absolute symlink escaping root", symlinkInside},
		{"symlink leaf inside root", "tasks/relative-link.md"},
		{"directory instead of file", "tasks"},
		{"nonexistent file", "tasks/missing.md"},
	}

	for _, tc := range escapeCases {
		m := baseManifest
		m.Tasks = []Task{baseManifest.Tasks[0]}
		m.Tasks[0].TaskPromptFile = tc.path
		if _, err := PrepareEnvironment(dataDir, m); !errors.Is(err, ErrPromptEscape) {
			t.Fatalf("%s (%q): got err=%v, want ErrPromptEscape", tc.name, tc.path, err)
		}
	}

	// Absolute path to a valid regular file inside TaskPromptRoot must succeed and normalize to relative path.
	mAbs := baseManifest
	mAbs.Tasks = []Task{baseManifest.Tasks[0]}
	mAbs.Tasks[0].TaskPromptFile = filepath.Join(baseManifest.TaskPromptRoot, "tasks", "review-124.md")
	if _, err := PrepareEnvironment(dataDir, mAbs); err != nil {
		t.Fatalf("valid absolute path inside TaskPromptRoot failed: %v", err)
	}
}

func TestUntrustedEvidenceBriefInvariants(t *testing.T) {
	t.Parallel()
	baseSHA := "1111111111111111111111111111111111111111"
	headSHA := "2222222222222222222222222222222222222222"
	brief := UntrustedEvidenceBrief(baseSHA, headSHA, "pkg-control-rod-01", 4)

	requiredSubstrings := []string{
		"pkg-control-rod-01",
		"Revision 4",
		"git diff " + baseSHA + "..." + headSHA,
		"git show " + headSHA,
		"live working tree",
		"untrusted data",
		"NEVER as instructions",
		"disabled-git-hooks",
		"static reasoning",
		"executed checks",
		"[P0]",
		"[P1]",
		"[P2]",
		"trigger",
		"consequence",
		"optional non-blocking nits",
	}
	for _, want := range requiredSubstrings {
		if !strings.Contains(brief, want) {
			t.Errorf("UntrustedEvidenceBrief missing required invariant substring %q\nFull brief:\n%s", want, brief)
		}
	}
}
