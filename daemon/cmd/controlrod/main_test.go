//go:build unix

package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/flyfission/control-rod/daemon/internal/runner"
)

func TestRunCheckCLIExitCodesAndOutputs(t *testing.T) {
	dir := t.TempDir()
	diffPath := filepath.Join(dir, "diff.patch")
	if err := os.WriteFile(diffPath, []byte("+return 42\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	// Usage / independence refusal exits 2.
	var out, errOut bytes.Buffer
	code := runCheckCLI([]string{"--author-runtime", "claude", "--checker", "claude", "--diff", diffPath, "--criteria-text", "1. ok"}, nil, &out, &errOut)
	if code != 2 {
		t.Fatalf("same-family exit = %d, want 2 (stderr: %s)", code, errOut.String())
	}

	out.Reset()
	errOut.Reset()
	code = runCheckCLI([]string{"--author-runtime", "claude", "--diff", diffPath, "--criteria-text", "1. ok", "--output", "xml"}, nil, &out, &errOut)
	if code != 2 {
		t.Fatalf("bad --output exit = %d, want 2", code)
	}

	// Missing diff/criteria exits 2.
	out.Reset()
	errOut.Reset()
	code = runCheckCLI([]string{"--author-runtime", "claude"}, nil, &out, &errOut)
	if code != 2 {
		t.Fatalf("missing args exit = %d, want 2", code)
	}

	// Fake runtime with pass verdict via --output json and file outputs.
	t.Setenv("CONTROLROD_ALLOW_FAKE", "1")
	fakeHome := t.TempDir()
	t.Setenv("CONTROLROD_HOME", fakeHome)
	receiptFile := filepath.Join(dir, "receipt.md")
	verdictFile := filepath.Join(dir, "verdict.json")

	// Pre-populate fake script? No: runCheckCLI takes standard flags without ExtraInputs,
	// so fake runtime without FAKE.sh runs copy mode and requires out/verification.json.
	// Without out/verification.json, fake copy mode fails with exit 1 (checker wrote no verification.json).
	out.Reset()
	errOut.Reset()
	code = runCheckCLI([]string{
		"--author-runtime", "claude",
		"--checker", "fake",
		"--diff", diffPath,
		"--criteria-text", "1. ok",
		"--output", "json",
		"--receipt-out", receiptFile,
		"--verdict-out", verdictFile,
	}, nil, &out, &errOut)
	if code != 1 {
		t.Fatalf("empty fake check exit = %d, want 1 (stdout=%s stderr=%s)", code, out.String(), errOut.String())
	}
	var parsed map[string]any
	if err := json.Unmarshal(out.Bytes(), &parsed); err != nil {
		t.Fatalf("json output invalid: %v\n%s", err, out.String())
	}
	if parsed["outcome"] != "inconclusive" {
		t.Fatalf("outcome = %v, want inconclusive", parsed["outcome"])
	}
	rb, err := os.ReadFile(receiptFile)
	if err != nil || !strings.Contains(string(rb), "<!-- controlrod-pr-receipt:v1 -->") {
		t.Fatalf("receipt file missing or invalid: %v %s", err, string(rb))
	}
	if _, err := os.Stat(verdictFile); err != nil {
		t.Fatalf("verdict file missing: %v", err)
	}

	// Pass verdict via fake script exits 0 and renders markdown and text outputs.
	passScript := `cat > out/verification.json <<'EOF'
{"outcome":"pass","findings":[]}
EOF
echo '{"type":"result","subtype":"success"}'
`
	out.Reset()
	errOut.Reset()
	code = runCheckCLIWith(
		[]string{
			"--author-runtime", "claude",
			"--checker", "fake",
			"--diff", diffPath,
			"--criteria-text", "1. ok",
			"--package-id", "PR #99",
			"--output", "markdown",
		},
		runner.CheckConfig{
			ExtraInputs: []runner.NamedFile{{
				Name:          "FAKE.sh",
				ContentBase64: base64.StdEncoding.EncodeToString([]byte(passScript)),
			}},
		},
		nil, &out, &errOut,
	)
	if code != 0 {
		t.Fatalf("pass check exit = %d, want 0 (stdout=%s stderr=%s)", code, out.String(), errOut.String())
	}
	if !strings.Contains(out.String(), "**PASS**") || !strings.Contains(out.String(), "PR #99") {
		t.Fatalf("unexpected markdown output:\n%s", out.String())
	}

	out.Reset()
	errOut.Reset()
	code = runCheckCLIWith(
		[]string{
			"--author-runtime", "claude",
			"--checker", "fake",
			"--diff", diffPath,
			"--criteria-text", "1. ok",
			"--output", "text",
		},
		runner.CheckConfig{
			ExtraInputs: []runner.NamedFile{{
				Name:          "FAKE.sh",
				ContentBase64: base64.StdEncoding.EncodeToString([]byte(passScript)),
			}},
		},
		nil, &out, &errOut,
	)
	if code != 0 || !strings.Contains(out.String(), "Control Rod check: PASS") {
		t.Fatalf("text output code=%d out=%s err=%s", code, out.String(), errOut.String())
	}
}
