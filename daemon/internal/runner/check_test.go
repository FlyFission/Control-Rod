//go:build unix

package runner

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDistinctFamilyEnforcesIndependentVendors(t *testing.T) {
	cases := []struct {
		author  string
		checker string
		wantOK  bool
	}{
		{"claude", "codex", true},
		{"anthropic", "openai", true},
		{"codex", "claude", true},
		{"claude", "agy", true},
		{"grok", "codex", true},
		{"claude", "fake", true},
		{"claude", "claude", false},
		{"claude", "anthropic", false},
		{"codex", "openai", false},
		{"claude", "opencode", false},
		{"claude", "ollama", false},
		{"opencode", "codex", false},
		{"ollama", "claude", false},
		{"unknown", "codex", false},
		{"", "codex", false},
	}
	for _, tc := range cases {
		ok, reason := DistinctFamily(tc.author, tc.checker)
		if ok != tc.wantOK {
			t.Errorf("DistinctFamily(%q, %q) = %v (%q), want %v", tc.author, tc.checker, ok, reason, tc.wantOK)
		}
		if !ok && reason == "" {
			t.Errorf("DistinctFamily(%q, %q) refused without reason", tc.author, tc.checker)
		}
	}
}

func TestDefaultCheckerSandboxPolicyPassesVerifyPolicy(t *testing.T) {
	job := &Job{Run: testRun("run-cli-chk", "pre-check")}
	p := DefaultCheckerSandboxPolicy()
	if err := bindSandboxPolicy(job, p); err != nil {
		t.Fatal(err)
	}
	got, err := VerifyPolicy(*job)
	if err != nil {
		t.Fatalf("VerifyPolicy rejected default checker policy: %v", err)
	}
	if len(got.AllowedHosts) != 0 {
		t.Fatalf("checker sandbox policy allowed hosts: %v", got.AllowedHosts)
	}
	if got.Driver != DriverNativeCLI {
		t.Fatalf("driver = %q, want %q", got.Driver, DriverNativeCLI)
	}
}

func TestRunCheckWithFakeRuntimePassFailInconclusive(t *testing.T) {
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	diffPath := filepath.Join(t.TempDir(), "change.diff")
	diffBody := "diff --git a/a.go b/a.go\n+func Add(a, b int) int { return a + b }\n"
	if err := os.WriteFile(diffPath, []byte(diffBody), 0o600); err != nil {
		t.Fatal(err)
	}
	criteriaPath := filepath.Join(t.TempDir(), "acceptance.md")
	if err := os.WriteFile(criteriaPath, []byte("1. Add returns a + b.\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	t.Run("pass marks author caller-declared and removes spawn receipt", func(t *testing.T) {
		home := t.TempDir()
		script := `set -eu
test -f inputs/deliverables/diff.patch
test -f inputs/criteria/acceptance.md
test -f inputs/BRIEF.md
grep -q "Add returns a + b." inputs/criteria/acceptance.md
cat > out/verification.json <<'EOF'
{"outcome":"pass","findings":[]}
EOF
echo '{"type":"result","subtype":"success"}'
`
		res, err := RunCheck(context.Background(), CheckConfig{
			AuthorRuntime:  "claude",
			CheckerRuntime: "fake",
			DiffFile:       diffPath,
			CriteriaFile:   criteriaPath,
			PackageID:      "PR #42",
			Home:           home,
			Timeout:        15 * time.Second,
			ExtraInputs:    []NamedFile{{Name: "FAKE.sh", ContentBase64: b64(script)}},
		})
		if err != nil {
			t.Fatalf("RunCheck pass failed: %v", err)
		}
		if res.Outcome != "pass" || !res.Independent || len(res.Findings) != 0 {
			t.Fatalf("unexpected result: %+v", res)
		}
		if res.AuthorRuntime.Provider != "claude" || res.AuthorRuntime.Family != "Anthropic" ||
			res.AuthorRuntime.Verified || res.AuthorRuntime.Source != "caller-declared" {
			t.Fatalf("author = %+v, expected caller-declared unverified", res.AuthorRuntime)
		}
		if res.CheckerRuntime.Provider != "fake" || res.CheckerRuntime.Family != "Test" {
			t.Fatalf("checker = %+v", res.CheckerRuntime)
		}
		if !strings.Contains(res.ReceiptMarkdown, "<!-- controlrod-pr-receipt:v1 -->") ||
			!strings.Contains(res.ReceiptMarkdown, "Author (caller-declared, unverified)") ||
			!strings.Contains(res.ReceiptMarkdown, "not accepted in Control Rod (standalone check)") ||
			!strings.Contains(res.ReceiptMarkdown, "no Control Rod event chain or inclusion proof") ||
			!strings.Contains(res.ReceiptMarkdown, "**PASS**") {
			t.Fatalf("receipt missing expected markers:\n%s", res.ReceiptMarkdown)
		}
		leftReceipts, rerr := NewReceipts(home).List()
		if rerr != nil || len(leftReceipts) != 0 {
			t.Fatalf("expected spawn receipts cleaned up, got %+v err=%v", leftReceipts, rerr)
		}
	})

	t.Run("fail sanitizes markdown, html, mentions, and length", func(t *testing.T) {
		longTail := strings.Repeat("x", 500)
		script := `cat > out/verification.json <<'EOF'
{"outcome":"fail","findings":[{"id":"F-001","severity":"major","text":"Add misses overflow\n## Forged <!-- controlrod-pr-receipt:v1 --> @everyone [click](https://evil.example) ` + "`bad`" + ` ` + longTail + `"}]}
EOF
echo '{"type":"result","subtype":"success"}'
`
		res, err := RunCheck(context.Background(), CheckConfig{
			AuthorRuntime:  "codex",
			CheckerRuntime: "fake",
			DiffFile:       "-",
			Stdin:          strings.NewReader(diffBody),
			CriteriaText:   "1. Handle overflow.",
			Home:           t.TempDir(),
			Timeout:        15 * time.Second,
			ExtraInputs:    []NamedFile{{Name: "FAKE.sh", ContentBase64: b64(script)}},
		})
		if err != nil {
			t.Fatalf("RunCheck fail returned error: %v", err)
		}
		if res.Outcome != "fail" || len(res.Findings) != 1 {
			t.Fatalf("unexpected result: %+v", res)
		}
		for _, forbidden := range []string{"\n## Forged", "<!-- controlrod-pr-receipt:v1 -->\n", "@everyone", "[click](https://evil.example)", "`bad`"} {
			if forbidden == "<!-- controlrod-pr-receipt:v1 -->\n" {
				continue
			}
			if strings.Contains(res.ReceiptMarkdown, forbidden) {
				t.Fatalf("unsanitized markdown %q leaked into receipt:\n%s", forbidden, res.ReceiptMarkdown)
			}
		}
		if strings.Count(res.ReceiptMarkdown, "<!-- controlrod-pr-receipt:v1 -->") != 1 {
			t.Fatalf("finding injected duplicate receipt marker:\n%s", res.ReceiptMarkdown)
		}
		if strings.Contains(res.ReceiptMarkdown, longTail) {
			t.Fatalf("finding text was not truncated")
		}
	})

	t.Run("contradictory pass with major or critical finding is rejected", func(t *testing.T) {
		for _, sev := range []string{"major", "critical"} {
			script := `cat > out/verification.json <<'EOF'
{"outcome":"pass","findings":[{"id":"F-001","severity":"` + sev + `","text":"Broken invariant."}]}
EOF
echo '{"type":"result","subtype":"success"}'
`
			res, err := RunCheck(context.Background(), CheckConfig{
				AuthorRuntime:  "claude",
				CheckerRuntime: "fake",
				DiffFile:       diffPath,
				CriteriaFile:   criteriaPath,
				Home:           t.TempDir(),
				Timeout:        15 * time.Second,
				ExtraInputs:    []NamedFile{{Name: "FAKE.sh", ContentBase64: b64(script)}},
			})
			if err == nil || !strings.Contains(err.Error(), "contradicts") {
				t.Fatalf("severity=%s: expected contradiction error, got res=%+v err=%v", sev, res, err)
			}
			if res.Outcome != "inconclusive" {
				t.Fatalf("severity=%s: outcome=%q, want inconclusive", sev, res.Outcome)
			}
		}
	})

	t.Run("inconclusive", func(t *testing.T) {
		script := `cat > out/verification.json <<'EOF'
{"outcome":"inconclusive","findings":[{"id":"F-001","severity":"info","text":"Tests not included in diff."}]}
EOF
echo '{"type":"result","subtype":"success"}'
`
		res, err := RunCheck(context.Background(), CheckConfig{
			AuthorRuntime:  "claude",
			CheckerRuntime: "fake",
			DiffFile:       diffPath,
			CriteriaFile:   criteriaPath,
			Home:           t.TempDir(),
			Timeout:        15 * time.Second,
			ExtraInputs:    []NamedFile{{Name: "FAKE.sh", ContentBase64: b64(script)}},
		})
		if err != nil {
			t.Fatalf("RunCheck inconclusive returned error: %v", err)
		}
		if res.Outcome != "inconclusive" {
			t.Fatalf("outcome = %q, want inconclusive", res.Outcome)
		}
	})
}

func TestRunCheckRefusesSymlinkedParentsAndBadInputs(t *testing.T) {
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	tmp := t.TempDir()
	diffPath := filepath.Join(tmp, "d.patch")
	if err := os.WriteFile(diffPath, []byte("+ok\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	emptyPath := filepath.Join(tmp, "empty.patch")
	if err := os.WriteFile(emptyPath, []byte("   \n"), 0o600); err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	outsideFile := filepath.Join(outside, "criteria.md")
	if err := os.WriteFile(outsideFile, []byte("1. stolen\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	symDir := filepath.Join(tmp, "linked")
	if err := os.Symlink(outside, symDir); err != nil {
		t.Skip("symlinks unavailable:", err)
	}
	symCriteria := filepath.Join(symDir, "criteria.md")
	symDiffDir := filepath.Join(symDir, "d.patch")
	if err := os.WriteFile(filepath.Join(outside, "d.patch"), []byte("+stolen\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	cases := []struct {
		name string
		cfg  CheckConfig
		want string
	}{
		{
			name: "same family",
			cfg:  CheckConfig{AuthorRuntime: "fake", CheckerRuntime: "fake", DiffFile: diffPath, CriteriaText: "1. ok"},
			want: "shares vendor family",
		},
		{
			name: "unknown author family",
			cfg:  CheckConfig{AuthorRuntime: "opencode", CheckerRuntime: "fake", DiffFile: diffPath, CriteriaText: "1. ok"},
			want: "fixed vendor family",
		},
		{
			name: "empty diff",
			cfg:  CheckConfig{AuthorRuntime: "claude", CheckerRuntime: "fake", DiffFile: emptyPath, CriteriaText: "1. ok"},
			want: "diff is empty",
		},
		{
			name: "missing criteria",
			cfg:  CheckConfig{AuthorRuntime: "claude", CheckerRuntime: "fake", DiffFile: diffPath},
			want: "acceptance criteria are required",
		},
		{
			name: "symlinked parent directory on criteria",
			cfg:  CheckConfig{AuthorRuntime: "claude", CheckerRuntime: "fake", DiffFile: diffPath, CriteriaFile: symCriteria},
			want: "symlinked path component",
		},
		{
			name: "symlinked parent directory on diff",
			cfg:  CheckConfig{AuthorRuntime: "claude", CheckerRuntime: "fake", DiffFile: symDiffDir, CriteriaText: "1. ok"},
			want: "symlinked path component",
		},
		{
			name: "invalid git ref",
			cfg:  CheckConfig{AuthorRuntime: "claude", CheckerRuntime: "fake", BaseRef: "--upload-pack=evil", CriteriaText: "1. ok"},
			want: "invalid --base",
		},
		{
			name: "invalid criteria ref",
			cfg:  CheckConfig{AuthorRuntime: "claude", CheckerRuntime: "fake", DiffFile: diffPath, CriteriaFile: "a.md", CriteriaRef: "-evil"},
			want: "invalid --criteria-ref",
		},
		{
			name: "invalid grade",
			cfg:  CheckConfig{AuthorRuntime: "claude", CheckerRuntime: "fake", DiffFile: diffPath, CriteriaText: "1. ok", Grade: "bogus"},
			want: "grade must be",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := RunCheck(context.Background(), tc.cfg)
			if !errors.Is(err, ErrCheckUsage) {
				t.Fatalf("got err=%v, want ErrCheckUsage", err)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err=%q does not contain %q", err.Error(), tc.want)
			}
		})
	}
}

func TestRunCheckGitDiffNeutralizesTextconvOverridesAndReadsBaseCriteria(t *testing.T) {
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	repo := t.TempDir()
	marker := filepath.Join(t.TempDir(), "textconv-ran")
	git := func(args ...string) {
		t.Helper()
		c := exec.Command("git", args...)
		c.Dir = repo
		c.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
		)
		if out, err := c.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	git("init")
	// Base commit has the real acceptance criteria and v1 of f.txt.
	if err := os.WriteFile(filepath.Join(repo, "acceptance.md"), []byte("1. BASE_CRITERIA_MUST_HOLD\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "f.txt"), []byte("v1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, ".gitattributes"), []byte("*.txt diff=pwn\n*.bin -diff\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "h.bin"), []byte("bin1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", "acceptance.md", "f.txt", ".gitattributes", "h.bin")
	git("commit", "-m", "base")

	// PR commit tampers with acceptance.md and updates f.txt and h.bin (marked -diff).
	if err := os.WriteFile(filepath.Join(repo, "acceptance.md"), []byte("1. PR_TAMPERED_ALWAYS_PASS\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "f.txt"), []byte("v2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "h.bin"), []byte("bin2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", "acceptance.md", "f.txt", "h.bin")
	git("commit", "-m", "pr-head")

	// Configure a repo-local textconv helper that plain `git diff HEAD~1..HEAD` executes.
	git("config", "diff.pwn.textconv", "sh -c 'touch "+marker+"; cat \"$1\"' _")
	plain := exec.Command("git", "diff", "HEAD~1..HEAD")
	plain.Dir = repo
	plainOut, err := plain.CombinedOutput()
	if err != nil {
		t.Fatalf("plain git diff failed: %v\n%s", err, plainOut)
	}
	if _, err := os.Stat(marker); err != nil {
		t.Fatalf("precondition failed: plain git diff did not execute repo textconv: %v", err)
	}
	if !strings.Contains(string(plainOut), "Binary files a/h.bin and b/h.bin differ") {
		t.Fatalf("precondition failed: plain git diff did not hide -diff file hunk:\n%s", plainOut)
	}
	_ = os.Remove(marker)

	script := `set -eu
grep -q "+v2" inputs/deliverables/diff.patch
grep -q "+bin2" inputs/deliverables/diff.patch
grep -q "BASE_CRITERIA_MUST_HOLD" inputs/criteria/acceptance.md
if grep -q "PR_TAMPERED_ALWAYS_PASS" inputs/criteria/acceptance.md; then
  echo "PR head criteria leaked instead of base ref" >&2
  exit 1
fi
cat > out/verification.json <<'EOF'
{"outcome":"pass","findings":[]}
EOF
echo '{"type":"result","subtype":"success"}'
`
	res, err := RunCheck(context.Background(), CheckConfig{
		AuthorRuntime:  "claude",
		CheckerRuntime: "fake",
		BaseRef:        "HEAD~1",
		HeadRef:        "HEAD",
		RepoDir:        repo,
		CriteriaFile:   "acceptance.md",
		CriteriaRef:    "HEAD~1",
		Home:           t.TempDir(),
		Timeout:        15 * time.Second,
		ExtraInputs:    []NamedFile{{Name: "FAKE.sh", ContentBase64: b64(script)}},
	})
	if err != nil {
		t.Fatalf("RunCheck git diff failed: %v", err)
	}
	if res.Outcome != "pass" {
		t.Fatalf("outcome = %q, want pass", res.Outcome)
	}
	if res.CriteriaSource != "git:HEAD~1:acceptance.md" {
		t.Fatalf("CriteriaSource = %q, want git:HEAD~1:acceptance.md", res.CriteriaSource)
	}
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("malicious repository diff textconv ran during RunCheck")
	}
	if _, err := json.Marshal(res); err != nil {
		t.Fatal(err)
	}
}

func TestResolveCheckerRuntimeAutoSelectsDistinctReadyRuntime(t *testing.T) {
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	id, _, err := resolveCheckerRuntime(context.Background(), CheckConfig{
		AuthorRuntime: "claude",
		LookPath:      func(string) (string, error) { return "", os.ErrNotExist },
		Getenv:        os.Getenv,
		Probe:         ExecRunner,
	}, RuntimeClaude)
	if err != nil {
		t.Fatalf("auto-select failed: %v", err)
	}
	if id != RuntimeFake {
		t.Fatalf("auto-selected %q, want %q", id, RuntimeFake)
	}
}

func TestRunCheckGitDiffBoundsMemoryOnOversizedDiff(t *testing.T) {
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	prevLimit := maxGitInputBytes
	maxGitInputBytes = 512
	t.Cleanup(func() { maxGitInputBytes = prevLimit })

	repo := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		c := exec.Command("git", args...)
		c.Dir = repo
		c.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
		)
		if out, err := c.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	git("init")
	if err := os.WriteFile(filepath.Join(repo, "big.txt"), []byte("start\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", "big.txt")
	git("commit", "-m", "base")

	bigPayload := strings.Repeat("oversized-diff-line-0123456789abcdef\n", 200)
	if err := os.WriteFile(filepath.Join(repo, "big.txt"), []byte(bigPayload), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", "big.txt")
	git("commit", "-m", "oversized")

	_, err := RunCheck(context.Background(), CheckConfig{
		AuthorRuntime:  "claude",
		CheckerRuntime: "fake",
		BaseRef:        "HEAD~1",
		HeadRef:        "HEAD",
		RepoDir:        repo,
		CriteriaText:   "1. Must enforce diff cap",
		Home:           t.TempDir(),
	})
	if !errors.Is(err, ErrCheckUsage) {
		t.Fatalf("got err=%v, want ErrCheckUsage", err)
	}
	if !strings.Contains(err.Error(), "diff exceeds 512 byte limit") {
		t.Fatalf("err=%q does not mention 512 byte limit", err.Error())
	}
}

func TestRunCheckRefusesDirectoryAndSymlinkCriteriaAtRef(t *testing.T) {
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	repo := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		c := exec.Command("git", args...)
		c.Dir = repo
		c.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=Test", "GIT_AUTHOR_EMAIL=test@example.com",
			"GIT_COMMITTER_NAME=Test", "GIT_COMMITTER_EMAIL=test@example.com",
		)
		if out, err := c.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	git("init")
	if err := os.MkdirAll(filepath.Join(repo, "docs"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "docs", "acceptance.md"), []byte("1. Regular criteria file\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("docs/acceptance.md", filepath.Join(repo, "link.md")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "src.txt"), []byte("v1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", "docs/acceptance.md", "link.md", "src.txt")
	git("commit", "-m", "base")

	if err := os.WriteFile(filepath.Join(repo, "src.txt"), []byte("v2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", "src.txt")
	git("commit", "-m", "head")

	for _, tc := range []struct {
		name string
		path string
		want string
	}{
		{name: "directory tree", path: "docs", want: "not a regular file"},
		{name: "git symlink", path: "link.md", want: "not a regular file"},
		{name: "missing path", path: "missing.md", want: "not found"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := RunCheck(context.Background(), CheckConfig{
				AuthorRuntime:  "claude",
				CheckerRuntime: "fake",
				BaseRef:        "HEAD~1",
				HeadRef:        "HEAD",
				RepoDir:        repo,
				CriteriaFile:   tc.path,
				CriteriaRef:    "HEAD",
				Home:           t.TempDir(),
			})
			if !errors.Is(err, ErrCheckUsage) {
				t.Fatalf("got err=%v, want ErrCheckUsage", err)
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err=%q does not contain %q", err.Error(), tc.want)
			}
		})
	}

	script := `cat > out/verification.json <<'EOF'
{"outcome":"pass","findings":[]}
EOF
echo '{"type":"result","subtype":"success"}'
`
	res, err := RunCheck(context.Background(), CheckConfig{
		AuthorRuntime:  "claude",
		CheckerRuntime: "fake",
		BaseRef:        "HEAD~1",
		HeadRef:        "HEAD",
		RepoDir:        repo,
		CriteriaFile:   "docs/acceptance.md",
		CriteriaRef:    "HEAD",
		PackageID:      "PR #7",
		Revision:       3,
		Home:           t.TempDir(),
		ExtraInputs:    []NamedFile{{Name: "FAKE.sh", ContentBase64: b64(script)}},
	})
	if err != nil {
		t.Fatalf("regular file under docs failed: %v", err)
	}
	if res.Revision != 3 || res.HeadSHA == "" || res.BaseSHA == "" {
		t.Fatalf("expected revision/base/head SHA populated, got rev=%d base=%q head=%q", res.Revision, res.BaseSHA, res.HeadSHA)
	}
	if !strings.Contains(res.ReceiptMarkdown, "<!-- controlrod-check-binding:") ||
		!strings.Contains(res.ReceiptMarkdown, res.DiffDigest.Value) ||
		!strings.Contains(res.ReceiptMarkdown, "pnpm cr verify --receipt") {
		t.Fatalf("receipt missing binding/verify link:\n%s", res.ReceiptMarkdown)
	}
}
