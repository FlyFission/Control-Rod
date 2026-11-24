package runner

import "testing"

func TestClassifyRunFailure(t *testing.T) {
	tests := []struct {
		name      string
		exitCode  int
		stderr    string
		lastError string
		want      FailureClass
	}{
		{
			name:     "quota exhausted via insufficient_quota",
			exitCode: 1,
			stderr:   `Error: 429 {"error":{"type":"insufficient_quota","message":"You exceeded your current quota"}}`,
			want:     FailureQuotaExhausted,
		},
		{
			name:      "quota exhausted via usage limit in lastError",
			exitCode:  1,
			lastError: "Daily usage limit reached; upgrade plan",
			want:      FailureQuotaExhausted,
		},
		{
			name:     "quota exhausted via credit exhausted",
			exitCode: 1,
			stderr:   "Billing error: credits exhausted for workspace",
			want:     FailureQuotaExhausted,
		},
		{
			name:     "quota exhausted via bare HTTP 429",
			exitCode: 1,
			stderr:   "request failed with HTTP 429",
			want:     FailureQuotaExhausted,
		},
		{
			name:     "rate limited via temporary rate limit",
			exitCode: 1,
			stderr:   "HTTP 429 Too Many Requests: rate_limit_exceeded, retry-after 10s",
			want:     FailureRateLimited,
		},
		{
			name:     "rate limited via 529 overloaded",
			exitCode: 1,
			stderr:   `{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}} (status 529)`,
			want:     FailureRateLimited,
		},
		{
			name:      "rate limited via bare 529",
			exitCode:  1,
			lastError: "upstream returned status 529",
			want:      FailureRateLimited,
		},
		{
			name:     "auth unavailable via 401",
			exitCode: 1,
			stderr:   "HTTP 401 Unauthorized: invalid_api_key",
			want:     FailureAuthUnavailable,
		},
		{
			name:      "auth unavailable via expired session",
			exitCode:  1,
			lastError: "Your session expired. Please log in again.",
			want:      FailureAuthUnavailable,
		},
		{
			name:     "auth unavailable via signed out",
			exitCode: 1,
			stderr:   "User is signed out; login required",
			want:     FailureAuthUnavailable,
		},
		{
			name:     "binary missing via exit code 127",
			exitCode: 127,
			stderr:   "sh: 1: omp: not found",
			want:     FailureBinaryMissing,
		},
		{
			name:      "binary missing via exec not found",
			exitCode:  1,
			lastError: `exec: "omp": executable file not found in $PATH`,
			want:      FailureBinaryMissing,
		},
		{
			name:     "binary missing via fork/exec no such file",
			exitCode: 1,
			stderr:   "fork/exec /usr/local/bin/omp: no such file or directory",
			want:     FailureBinaryMissing,
		},
		{
			name:     "content refusal takes precedence over everything",
			exitCode: 1,
			stderr:   "HTTP 400 content_policy_violation: Output blocked by content filtering",
			want:     FailureContentRefusal,
		},
		{
			name:      "content refusal in lastError",
			exitCode:  1,
			lastError: "Model returned safety refusal: cannot assist with request",
			want:      FailureContentRefusal,
		},
		{
			name:     "transient network via connection reset",
			exitCode: 1,
			stderr:   "read tcp 10.0.0.2:443: connection reset by peer",
			want:     FailureTransientNetwork,
		},
		{
			name:      "transient network via timeout",
			exitCode:  1,
			lastError: "Post https://api.example.com: context deadline exceeded (Client.Timeout)",
			want:      FailureTransientNetwork,
		},
		{
			name:     "transient network via 502 bad gateway",
			exitCode: 1,
			stderr:   "HTTP/2 502 Bad Gateway",
			want:     FailureTransientNetwork,
		},
		{
			name:     "transient network via 503 service unavailable",
			exitCode: 1,
			stderr:   "status code 503: upstream service unavailable",
			want:     FailureTransientNetwork,
		},
		{
			name:     "fatal on ordinary compile or repo error",
			exitCode: 1,
			stderr:   "open ./missing.go: no such file or directory",
			want:     FailureFatal,
		},
		{
			name:     "fatal when number 401 appears inside larger number",
			exitCode: 1,
			stderr:   "syntax error on line 14012: unexpected token",
			want:     FailureFatal,
		},
		{
			name:     "fatal when word thereof contains eof",
			exitCode: 1,
			stderr:   "invalid argument or part thereof",
			want:     FailureFatal,
		},
		{
			name:     "fatal on empty error",
			exitCode: 2,
			want:     FailureFatal,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := ClassifyRunFailure(tc.exitCode, tc.stderr, tc.lastError)
			if got != tc.want {
				t.Fatalf("ClassifyRunFailure(%d, %q, %q) = %q, want %q", tc.exitCode, tc.stderr, tc.lastError, got, tc.want)
			}
		})
	}
}

func TestDecisionForFailureClass(t *testing.T) {
	tests := []struct {
		class          FailureClass
		wantFailover   bool
		wantRetrySame  bool
		wantCooldown   bool
		wantFinalClass FailureClass
	}{
		{FailureQuotaExhausted, true, false, true, FailureQuotaExhausted},
		{FailureRateLimited, true, true, true, FailureRateLimited},
		{FailureAuthUnavailable, true, false, true, FailureAuthUnavailable},
		{FailureBinaryMissing, true, false, true, FailureBinaryMissing},
		{FailureContentRefusal, false, false, false, FailureContentRefusal},
		{FailureTransientNetwork, false, true, false, FailureTransientNetwork},
		{FailureFatal, false, false, false, FailureFatal},
		{FailureClass("unknown_future_class"), false, false, false, FailureFatal},
	}

	for _, tc := range tests {
		t.Run(string(tc.class), func(t *testing.T) {
			d := DecisionForFailureClass(tc.class)
			if d.Class != tc.wantFinalClass {
				t.Errorf("Class = %q, want %q", d.Class, tc.wantFinalClass)
			}
			if d.AuthorFailoverEligible != tc.wantFailover {
				t.Errorf("AuthorFailoverEligible = %v, want %v", d.AuthorFailoverEligible, tc.wantFailover)
			}
			if d.RetrySameCandidate != tc.wantRetrySame {
				t.Errorf("RetrySameCandidate = %v, want %v", d.RetrySameCandidate, tc.wantRetrySame)
			}
			if d.CooldownEligible != tc.wantCooldown {
				t.Errorf("CooldownEligible = %v, want %v", d.CooldownEligible, tc.wantCooldown)
			}
			if d.Reason == "" {
				t.Errorf("Reason should be non-empty")
			}
		})
	}
}

func TestShouldAuthorFailoverEnforcesAuthorOnly(t *testing.T) {
	eligible := DecisionForFailureClass(FailureQuotaExhausted)
	ineligible := DecisionForFailureClass(FailureContentRefusal)
	transient := DecisionForFailureClass(FailureTransientNetwork)

	// Author role may fail over only when decision is eligible.
	if !ShouldAuthorFailover("author", eligible) {
		t.Fatalf("expected author + quota_exhausted to allow failover")
	}
	if ShouldAuthorFailover("author", ineligible) {
		t.Fatalf("expected author + content_refusal to deny failover")
	}
	if ShouldAuthorFailover("author", transient) {
		t.Fatalf("expected author + transient_network to deny failover")
	}

	// Non-author roles MUST NEVER fail over (ADR 0023 / ADR 0024 Decision 6).
	nonAuthorRoles := []string{
		"pre-check",
		"checker",
		"refute",
		"reviewer",
		"council",
		"",
		"   ",
	}
	for _, role := range nonAuthorRoles {
		for _, class := range []FailureClass{
			FailureQuotaExhausted,
			FailureRateLimited,
			FailureAuthUnavailable,
			FailureBinaryMissing,
			FailureContentRefusal,
			FailureTransientNetwork,
			FailureFatal,
		} {
			d := DecisionForFailureClass(class)
			if ShouldAuthorFailover(role, d) {
				t.Fatalf("ShouldAuthorFailover(%q, %q) = true, want false (non-author roles must never fail over)", role, class)
			}
		}
	}
}

func TestDecideRunFailureRoundTrip(t *testing.T) {
	d := DecideRunFailure(1, "429 insufficient_quota", "")
	if d.Class != FailureQuotaExhausted || !d.AuthorFailoverEligible || d.RetrySameCandidate {
		t.Fatalf("unexpected decision: %+v", d)
	}
	if !ShouldAuthorFailover("author", d) {
		t.Fatalf("expected author failover for quota exhausted")
	}
	if ShouldAuthorFailover("pre-check", d) {
		t.Fatalf("expected pre-check failover to be forbidden")
	}
}
