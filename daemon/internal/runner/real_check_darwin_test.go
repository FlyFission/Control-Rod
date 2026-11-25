package runner

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// TestRealCheckerOnThisMac runs a real blind check with an installed, signed-in agent CLI, through
// the same preparation, sandbox, launch and settlement a card's check uses. CI has no signed-in
// agents, so it runs only when asked: CONTROLROD_REAL_CHECKER=codex (or claude, grok, agy). It is
// the Mac test set's guard against a checker that starts but cannot finish (a missing helper, a
// nested sandbox, a login it cannot read): the check must end with a verdict, not an error.
func TestRealCheckerOnThisMac(t *testing.T) {
	checker := os.Getenv("CONTROLROD_REAL_CHECKER")
	if checker == "" {
		t.Skip("set CONTROLROD_REAL_CHECKER=codex (or claude, grok, agy) to run a real check on this Mac")
	}
	author := "claude"
	if RuntimeFamily(checker) == RuntimeFamily("claude") {
		author = "codex"
	}
	dir := t.TempDir()
	diff := filepath.Join(dir, "change.patch")
	if err := os.WriteFile(diff, []byte(`diff --git a/README.md b/README.md
--- a/README.md
+++ b/README.md
@@ -1 +1,2 @@
 # Sandbox
+Hello from Control Rod.
`), 0o644); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	res, err := RunCheck(ctx, CheckConfig{
		AuthorRuntime:  author,
		CheckerRuntime: checker,
		DiffFile:       diff,
		CriteriaText:   "README.md gains exactly one line that says hello.",
		Timeout:        10 * time.Minute,
	})
	if err != nil {
		t.Fatalf("the check could not run: %v", err)
	}
	t.Logf("outcome %q, findings %d, error %q", res.Outcome, len(res.Findings), res.Error)
	if res.Error != "" || (res.Outcome != "pass" && res.Outcome != "fail") {
		t.Fatalf("a real %s check must end with a verdict: %+v", checker, res)
	}
}
