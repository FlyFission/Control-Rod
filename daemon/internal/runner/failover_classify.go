package runner

import (
	"regexp"
	"strings"
)

// FailureClass categorizes why a runtime execution failed so failover and retry policy
// can act deterministically without silent pass-shopping (ADR 0023, ADR 0024 Decision 6).
type FailureClass string

const (
	// FailureQuotaExhausted indicates an account, billing, or hard usage quota has been reached.
	FailureQuotaExhausted FailureClass = "quota_exhausted"
	// FailureRateLimited indicates temporary provider throttling or capacity overload (e.g. 529).
	FailureRateLimited FailureClass = "rate_limited"
	// FailureAuthUnavailable indicates missing, expired, or rejected runtime credentials.
	FailureAuthUnavailable FailureClass = "auth_unavailable"
	// FailureBinaryMissing indicates the runtime CLI binary is not installed or cannot be exec'd.
	FailureBinaryMissing FailureClass = "binary_missing"
	// FailureContentRefusal indicates a safety or content policy refusal; never failover-eligible.
	FailureContentRefusal FailureClass = "content_refusal"
	// FailureTransientNetwork indicates a transient transport, DNS, TLS, or upstream 502/503/504 error.
	FailureTransientNetwork FailureClass = "transient_network"
	// FailureFatal covers all other errors that are neither retryable nor failover-eligible.
	FailureFatal FailureClass = "fatal"
)

// FailureDecision is the deterministic retry and failover policy for a FailureClass.
type FailureDecision struct {
	Class                  FailureClass `json:"class"`
	AuthorFailoverEligible bool         `json:"author_failover_eligible"`
	RetrySameCandidate     bool         `json:"retry_same_candidate"`
	CooldownEligible       bool         `json:"cooldown_eligible"`
	Reason                 string       `json:"reason"`
}

var (
	reHTTP401 = regexp.MustCompile(`\b(?:http/?[\d.]*\s+|status(?:\s+code)?\s*[:=]?\s*|error\s*[:=]?\s*|^)401\b|\b401\s+unauthorized\b`)
	reHTTP429 = regexp.MustCompile(`\b(?:http/?[\d.]*\s+|status(?:\s+code)?\s*[:=]?\s*|error\s*[:=]?\s*|^)429\b|\b429\b`)
	reHTTP529 = regexp.MustCompile(`\b(?:http/?[\d.]*\s+|status(?:\s+code)?\s*[:=]?\s*|error\s*[:=]?\s*|^)529\b|\b529\s+overloaded\b`)
	reHTTP5xx = regexp.MustCompile(`\b(?:http/?[\d.]*\s+|status(?:\s+code)?\s*[:=]?\s*|error\s*[:=]?\s*|^)(?:502|503|504)\b|\b(?:502\s+bad\s+gateway|503\s+service\s+unavailable|504\s+gateway\s+timeout)\b`)
	reWordEOF = regexp.MustCompile(`\b(?:unexpected\s+)?eof\b`)
)

// ClassifyRunFailure deterministically classifies a failed runtime execution from its exit code,
// stderr output, and last reported error string.
//
// Precedence is deliberate:
//  1. Content/policy refusals are checked first so a safety refusal can never be reclassified as
//     a failover-eligible failure.
//  2. Missing binaries (including POSIX exit code 127).
//  3. Auth/session failures.
//  4. Explicit quota/credit exhaustion, then temporary rate-limiting/overload, then bare HTTP 429.
//  5. Transient network/gateway failures.
//  6. Everything else defaults to FailureFatal (fail-closed).
func ClassifyRunFailure(exitCode int, stderr, lastError string) FailureClass {
	combined := strings.ToLower(strings.TrimSpace(stderr + "\n" + lastError))

	if isContentRefusal(combined) {
		return FailureContentRefusal
	}
	if isBinaryMissing(exitCode, combined) {
		return FailureBinaryMissing
	}
	if isAuthUnavailable(combined) {
		return FailureAuthUnavailable
	}
	if isQuotaExhausted(combined) {
		return FailureQuotaExhausted
	}
	if isRateLimited(combined) {
		return FailureRateLimited
	}
	if reHTTP429.MatchString(combined) {
		return FailureQuotaExhausted
	}
	if isTransientNetwork(combined) {
		return FailureTransientNetwork
	}
	return FailureFatal
}

// DecisionForFailureClass maps a FailureClass to its deterministic retry/failover policy.
// Unknown classes fail closed to FailureFatal semantics.
func DecisionForFailureClass(class FailureClass) FailureDecision {
	switch class {
	case FailureQuotaExhausted:
		return FailureDecision{
			Class:                  FailureQuotaExhausted,
			AuthorFailoverEligible: true,
			RetrySameCandidate:     false,
			CooldownEligible:       true,
			Reason:                 "quota or credit limit exhausted on current candidate",
		}
	case FailureRateLimited:
		return FailureDecision{
			Class:                  FailureRateLimited,
			AuthorFailoverEligible: true,
			RetrySameCandidate:     true,
			CooldownEligible:       true,
			Reason:                 "provider temporarily rate limited or overloaded",
		}
	case FailureAuthUnavailable:
		return FailureDecision{
			Class:                  FailureAuthUnavailable,
			AuthorFailoverEligible: true,
			RetrySameCandidate:     false,
			CooldownEligible:       true,
			Reason:                 "runtime authentication missing or expired",
		}
	case FailureBinaryMissing:
		return FailureDecision{
			Class:                  FailureBinaryMissing,
			AuthorFailoverEligible: true,
			RetrySameCandidate:     false,
			CooldownEligible:       true,
			Reason:                 "runtime CLI binary is not installed",
		}
	case FailureContentRefusal:
		return FailureDecision{
			Class:                  FailureContentRefusal,
			AuthorFailoverEligible: false,
			RetrySameCandidate:     false,
			CooldownEligible:       false,
			Reason:                 "safety or policy refusal is not eligible for failover or cooldown",
		}
	case FailureTransientNetwork:
		return FailureDecision{
			Class:                  FailureTransientNetwork,
			AuthorFailoverEligible: false,
			RetrySameCandidate:     true,
			CooldownEligible:       false,
			Reason:                 "transient network or upstream gateway error",
		}
	default:
		return FailureDecision{
			Class:                  FailureFatal,
			AuthorFailoverEligible: false,
			RetrySameCandidate:     false,
			CooldownEligible:       false,
			Reason:                 "non-recoverable runtime failure",
		}
	}
}

// DecideRunFailure classifies a run failure and returns its corresponding FailureDecision.
func DecideRunFailure(exitCode int, stderr, lastError string) FailureDecision {
	return DecisionForFailureClass(ClassifyRunFailure(exitCode, stderr, lastError))
}

// ShouldAuthorFailover enforces ADR 0023 / ADR 0024 Decision 6: failover is strictly permitted
// only for the "author" role. Checker, pre-check, refute, or unknown roles always return false
// so verifier failures can never silently shop for a passing verdict.
func ShouldAuthorFailover(role string, decision FailureDecision) bool {
	if strings.ToLower(strings.TrimSpace(role)) != "author" {
		return false
	}
	return decision.AuthorFailoverEligible
}

func containsAny(s string, needles ...string) bool {
	for _, n := range needles {
		if strings.Contains(s, n) {
			return true
		}
	}
	return false
}

func isContentRefusal(s string) bool {
	return containsAny(s,
		"content policy",
		"safety policy",
		"usage policy",
		"policy violation",
		"content_filter",
		"content filter",
		"safety_refusal",
		"safety refusal",
		"output blocked by content filtering",
		"blocked by safety",
		"flagged as unsafe",
		"violates our",
		"refused to comply",
		"refused to assist",
		"refused for safety",
		"cannot assist with",
		"can't assist with",
		"i cannot help with",
		"harmful content",
		"content_policy_violation",
	)
}

func isBinaryMissing(exitCode int, s string) bool {
	if exitCode == 127 {
		return true
	}
	if containsAny(s,
		"executable file not found",
		"command not found",
		"cli not installed",
		"binary not found",
		"binary is not installed",
		"not found in $path",
		"not found in path",
		"enoent: spawn",
	) {
		return true
	}
	if strings.Contains(s, "no such file or directory") && containsAny(s, "exec:", "fork/exec", "executable") {
		return true
	}
	return false
}

func isAuthUnavailable(s string) bool {
	if reHTTP401.MatchString(s) {
		return true
	}
	return containsAny(s,
		"unauthorized",
		"authentication_error",
		"authentication failed",
		"invalid api key",
		"invalid_api_key",
		"api key not found",
		"missing api key",
		"expired session",
		"session expired",
		"token expired",
		"signed out",
		"not logged in",
		"login required",
		"please log in",
		"re-authenticate",
		"reauthenticate",
		"credentials expired",
		"invalid credentials",
		"auth required",
	)
}

func isQuotaExhausted(s string) bool {
	return containsAny(s,
		"insufficient_quota",
		"quota exceeded",
		"exceeded your current quota",
		"quota_exceeded",
		"usage limit",
		"usage_limit",
		"credit exhausted",
		"credits exhausted",
		"credit_exhausted",
		"out of credits",
		"insufficient credits",
		"billing hard limit",
		"spending limit",
		"monthly limit",
		"daily limit",
		"plan limit",
		"account quota",
		"hit your limit",
	)
}

func isRateLimited(s string) bool {
	if reHTTP529.MatchString(s) {
		return true
	}
	return containsAny(s,
		"overloaded_error",
		"overloaded",
		"rate_limit",
		"rate limit",
		"too many requests",
		"requests per minute",
		"tokens per minute",
		"throttl",
		"retry-after",
		"retry after",
		"high demand",
	)
}

func isTransientNetwork(s string) bool {
	if reHTTP5xx.MatchString(s) || reWordEOF.MatchString(s) {
		return true
	}
	return containsAny(s,
		"connection reset",
		"econnreset",
		"connection refused",
		"econnrefused",
		"broken pipe",
		"epipe",
		"timed out",
		"timeout",
		"etimedout",
		"deadline exceeded",
		"temporary failure in name resolution",
		"no such host",
		"tls handshake",
		"network is unreachable",
		"bad gateway",
		"service unavailable",
		"gateway timeout",
		"i/o timeout",
	)
}
