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

	t.Run("pass", func(t *testing.T) {
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
			Home:           t.TempDir(),
			Timeout:        15 * time.Second,
			ExtraInputs:    []NamedFile{{Name: "FAKE.sh", ContentBase64: b64(script)}},
		})
		if err != nil {
			t.Fatalf("RunCheck pass failed: %v", err)
		}
		if res.Outcome != "pass" || !res.Independent || len(res.Findings) != 0 {
			t.Fatalf("unexpected result: %+v", res)
		}
		if res.AuthorRuntime.Provider != "claude" || res.AuthorRuntime.Family != "Anthropic" {
			t.Fatalf("author = %+v", res.AuthorRuntime)
		}
		if res.CheckerRuntime.Provider != "fake" || res.CheckerRuntime.Family != "Test" {
			t.Fatalf("checker = %+v", res.CheckerRuntime)
		}
		if !strings.Contains(res.ReceiptMarkdown, "<!-- controlrod-pr-receipt:v1 -->") ||
			!strings.Contains(res.ReceiptMarkdown, "not accepted in Control Rod (standalone check)") ||
			!strings.Contains(res.ReceiptMarkdown, "no Control Rod event chain") ||
			!strings.Contains(res.ReceiptMarkdown, "**PASS**") {
			t.Fatalf("receipt missing expected markers:\n%s", res.ReceiptMarkdown)
		}
	})

	t.Run("fail sanitizes findings", func(t *testing.T) {
		script := `cat > out/verification.json <<'EOF'
{"outcome":"fail","findings":[{"id":"F-001","severity":"major","text":"Add misses overflow\n## Forged heading ` + "`bad`" + `"}]}
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
		if strings.Contains(res.ReceiptMarkdown, "\n## Forged heading") {
			t.Fatalf("newline in finding broke markdown structure:\n%s", res.ReceiptMarkdown)
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

func TestRunCheckRefusesSameVendorAndBadInputs(t *testing.T) {
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	diffPath := filepath.Join(t.TempDir(), "d.patch")
	if err := os.WriteFile(diffPath, []byte("+ok\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	emptyPath := filepath.Join(t.TempDir(), "empty.patch")
	if err := os.WriteFile(emptyPath, []byte("   \n"), 0o600); err != nil {
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
			name: "invalid git ref",
			cfg:  CheckConfig{AuthorRuntime: "claude", CheckerRuntime: "fake", BaseRef: "--upload-pack=evil", CriteriaText: "1. ok"},
			want: "invalid --base",
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

func TestRunCheckGitDiffUsesHostGitCommandAndNeutralizesFilters(t *testing.T) {
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	repo := t.TempDir()
	marker := filepath.Join(t.TempDir(), "filter-ran")
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
	if err := os.WriteFile(filepath.Join(repo, "f.txt"), []byte("v1\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", "f.txt")
	git("commit", "-m", "init")
	if err := os.WriteFile(filepath.Join(repo, ".gitattributes"), []byte("*.txt filter=pwn\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "f.txt"), []byte("v2\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	git("add", ".gitattributes", "f.txt")
	git("commit", "-m", "v2")
	git("config", "filter.pwn.clean", "touch "+marker+"; cat")
	git("config", "filter.pwn.smudge", "touch "+marker+"; cat")
	_ = os.Remove(marker)

	script := `set -eu
grep -q "+v2" inputs/deliverables/diff.patch
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
		CriteriaText:   "1. f.txt updated to v2.",
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
	if _, err := os.Stat(marker); err == nil {
		t.Fatal("malicious repository filter driver ran during git diff")
	}
	// JSON serialization sanity check
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
