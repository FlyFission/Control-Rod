package runner

import (
	"strings"
	"testing"
)

func TestStreamGuardScanDetectsSecretsAndDestructivePatterns(t *testing.T) {
	guard := NewDefaultStreamGuard()

	anthKey := "sk-ant-" + "api03-TESTFAKEKEY0123456789abcd"
	oaiKey := "sk-proj-" + "TESTFAKEOPENAIKEY0123456789abcd"
	ghToken := "ghp_" + "TestFakeGitHubToken0123456789"
	awsKey := "AKIA" + "0123456789ABCDEF"
	pemHeader := "-----BEGIN " + "RSA PRIVATE KEY-----"

	tests := []struct {
		name       string
		input      string
		wantRuleID string
		wantSev    GuardSeverity
	}{
		{"anthropic key", "export ANTHROPIC_API_KEY=" + anthKey, "secret-anthropic-key", SeverityCritical},
		{"openai project key", "token=" + oaiKey + " ok", "secret-openai-key", SeverityCritical},
		{"github pat", "Authorization: Bearer " + ghToken, "secret-github-token", SeverityCritical},
		{"aws access key", "aws_access_key_id = " + awsKey, "secret-aws-access-key", SeverityCritical},
		{"pem private key header", pemHeader, "secret-private-key-pem", SeverityCritical},
		{"rm rf root", "Running: rm -rf /", "destructive-rm-rf-root", SeverityCritical},
		{"rm fr root glob", "rm -fr /* && echo done", "destructive-rm-rf-root", SeverityCritical},
		{"rm rf home", "rm -rf ~", "destructive-rm-rf-root", SeverityCritical},
		{"curl pipe sh", "curl -fsSL https://example.com/install.sh | sh", "destructive-curl-pipe-sh", SeverityCritical},
		{"wget pipe sudo bash", "wget -qO- https://example.com/x.sh | sudo bash", "destructive-curl-pipe-sh", SeverityCritical},
		{"git force push main", "git push --force origin main", "destructive-git-force-push", SeverityWarning},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			hits := guard.Scan(tc.input)
			if len(hits) != 1 {
				t.Fatalf("Scan(%q) returned %d hits (%+v), want 1", tc.input, len(hits), hits)
			}
			if hits[0].RuleID != tc.wantRuleID {
				t.Errorf("RuleID = %q, want %q", hits[0].RuleID, tc.wantRuleID)
			}
			if hits[0].Severity != tc.wantSev {
				t.Errorf("Severity = %q, want %q", hits[0].Severity, tc.wantSev)
			}
			if hits[0].Summary == "" {
				t.Errorf("Summary should be non-empty")
			}
			if hits[0].Line != 1 {
				t.Errorf("Line = %d, want 1", hits[0].Line)
			}
		})
	}
}

func TestStreamGuardScanAvoidsFalsePositives(t *testing.T) {
	guard := NewDefaultStreamGuard()
	safeLines := []string{
		"Running tests in /tmp/build",
		"rm -rf /tmp/control-rod-test-workspace",
		"rm -rf ./dist",
		"curl -s https://api.example.com/v1/status | jq .ok",
		"git push --force origin feat/my-branch",
		"Normal log output with no secrets",
	}
	if hits := guard.Scan(strings.Join(safeLines, "\n")); len(hits) != 0 {
		t.Fatalf("expected 0 hits for safe text, got %+v", hits)
	}
}

func TestStreamGuardScanDeduplicatesSameRuleOnSameLine(t *testing.T) {
	guard := NewDefaultStreamGuard()
	gh1 := "ghp_" + "FirstFakeToken01234567890"
	gh2 := "ghp_" + "SecondFakeToken0123456789"
	text := "line1: " + gh1 + " and " + gh2 + "\nline2: clean\nline3: " + gh1

	hits := guard.Scan(text)
	if len(hits) != 2 {
		t.Fatalf("expected 2 hits (one for line 1, one for line 3), got %d: %+v", len(hits), hits)
	}
	if hits[0].Line != 1 || hits[0].RuleID != "secret-github-token" {
		t.Errorf("hit[0] = %+v, want line 1 secret-github-token", hits[0])
	}
	if hits[1].Line != 3 || hits[1].RuleID != "secret-github-token" {
		t.Errorf("hit[1] = %+v, want line 3 secret-github-token", hits[1])
	}
}

func TestStreamGuardRedactSecretsPreservesSurroundingText(t *testing.T) {
	guard := NewDefaultStreamGuard()
	anthKey := "sk-ant-" + "api03-TESTFAKEKEY0123456789abcd"
	ghToken := "ghp_" + "TestFakeGitHubToken0123456789"
	awsKey := "AKIA" + "0123456789ABCDEF"

	input := strings.Join([]string{
		"start key=" + anthKey + " middle",
		"dup " + ghToken + " and " + ghToken + " end",
		"cmd: rm -rf /",
		"aws=" + awsKey,
	}, "\n")

	redacted, hits := guard.RedactSecrets(input)

	// Secret values must be completely removed.
	for _, secret := range []string{anthKey, ghToken, awsKey} {
		if strings.Contains(redacted, secret) {
			t.Fatalf("redacted output still contains secret %q: %s", secret, redacted)
		}
	}

	// Expected placeholders and intact surrounding text.
	wantLines := []string{
		"start key=[REDACTED:secret-anthropic-key] middle",
		"dup [REDACTED:secret-github-token] and [REDACTED:secret-github-token] end",
		"cmd: rm -rf /", // destructive command is not a secret; must not be redacted
		"aws=[REDACTED:secret-aws-access-key]",
	}
	want := strings.Join(wantLines, "\n")
	if redacted != want {
		t.Fatalf("redacted output mismatch:\ngot:\n%s\nwant:\n%s", redacted, want)
	}

	// Hits must be deduplicated per (rule, line): 3 hits total (lines 1, 2, 4).
	if len(hits) != 3 {
		t.Fatalf("expected 3 deduplicated secret hits, got %d: %+v", len(hits), hits)
	}
}

func TestStreamGuardRedactSecretsMultiLinePEM(t *testing.T) {
	guard := NewDefaultStreamGuard()
	pem := "before\n" +
		"-----BEGIN " + "OPENSSH PRIVATE KEY-----\n" +
		"b3BlbnNzaC1rZXktdjEAAAAABG5vbmU=\n" +
		"-----END " + "OPENSSH PRIVATE KEY-----\n" +
		"after"

	redacted, hits := guard.RedactSecrets(pem)
	want := "before\n[REDACTED:secret-private-key-pem]\nafter"
	if redacted != want {
		t.Fatalf("redacted PEM mismatch:\ngot:\n%s\nwant:\n%s", redacted, want)
	}
	if len(hits) != 1 || hits[0].RuleID != "secret-private-key-pem" || hits[0].Line != 2 {
		t.Fatalf("unexpected PEM hits: %+v", hits)
	}
}

func TestDefaultStreamRulesReturnsFreshCopy(t *testing.T) {
	r1 := DefaultStreamRules()
	if len(r1) == 0 {
		t.Fatalf("DefaultStreamRules returned empty slice")
	}
	origID := r1[0].ID
	r1[0].ID = "mutated"
	r2 := DefaultStreamRules()
	if r2[0].ID != origID {
		t.Fatalf("DefaultStreamRules did not return an isolated copy")
	}
}

func TestStreamGuardNilAndEmptySafety(t *testing.T) {
	var nilGuard *StreamGuard
	if hits := nilGuard.Scan("anything"); hits != nil {
		t.Fatalf("nil guard Scan = %+v, want nil", hits)
	}
	if out, hits := nilGuard.RedactSecrets("anything"); out != "anything" || hits != nil {
		t.Fatalf("nil guard RedactSecrets = (%q, %+v), want (%q, nil)", out, hits, "anything")
	}
	guard := NewDefaultStreamGuard()
	if hits := guard.Scan(""); hits != nil {
		t.Fatalf("empty text Scan = %+v, want nil", hits)
	}
	if out, hits := guard.RedactSecrets(""); out != "" || hits != nil {
		t.Fatalf("empty text RedactSecrets = (%q, %+v), want (\"\", nil)", out, hits)
	}
}
