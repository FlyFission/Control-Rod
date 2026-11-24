package runner

import (
	"regexp"
	"strings"
)

// GuardSeverity classifies the severity of a StreamGuard match.
type GuardSeverity string

const (
	SeverityInfo     GuardSeverity = "info"
	SeverityWarning  GuardSeverity = "warning"
	SeverityCritical GuardSeverity = "critical"
)

// GuardCategory groups StreamRule matches by kind.
type GuardCategory string

const (
	CategorySecret      GuardCategory = "secret"
	CategoryDestructive GuardCategory = "destructive"
)

// StreamRule defines one compiled deterministic guardrail evaluated against live output text.
// Because Go's regexp uses RE2, every rule executes in linear time with zero context-window tax.
type StreamRule struct {
	ID       string
	Category GuardCategory
	Severity GuardSeverity
	Summary  string
	Pattern  *regexp.Regexp
	Redact   bool
}

// GuardHit is one structured finding returned by StreamGuard.Scan or StreamGuard.RedactSecrets.
type GuardHit struct {
	RuleID   string        `json:"rule_id"`
	Category GuardCategory `json:"category,omitempty"`
	Severity GuardSeverity `json:"severity"`
	Summary  string        `json:"summary"`
	Line     int           `json:"line,omitempty"`
}

// StreamGuard evaluates normalized output text against a compiled set of deterministic rules
// for credential leakage and destructive shell patterns.
type StreamGuard struct {
	rules []StreamRule
}

var defaultStreamRules = []StreamRule{
	{
		ID:       "secret-anthropic-key",
		Category: CategorySecret,
		Severity: SeverityCritical,
		Summary:  "Anthropic API key detected in output",
		Pattern:  regexp.MustCompile(`sk-ant-[A-Za-z0-9_-]{16,}`),
		Redact:   true,
	},
	{
		ID:       "secret-openai-key",
		Category: CategorySecret,
		Severity: SeverityCritical,
		Summary:  "OpenAI API key detected in output",
		Pattern:  regexp.MustCompile(`\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{20,}\b`),
		Redact:   true,
	},
	{
		ID:       "secret-github-token",
		Category: CategorySecret,
		Severity: SeverityCritical,
		Summary:  "GitHub token detected in output",
		Pattern:  regexp.MustCompile(`\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b`),
		Redact:   true,
	},
	{
		ID:       "secret-aws-access-key",
		Category: CategorySecret,
		Severity: SeverityCritical,
		Summary:  "AWS access key ID detected in output",
		Pattern:  regexp.MustCompile(`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b`),
		Redact:   true,
	},
	{
		ID:       "secret-private-key-pem",
		Category: CategorySecret,
		Severity: SeverityCritical,
		Summary:  "Private key PEM block or header detected in output",
		Pattern:  regexp.MustCompile(`-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----(?:[\s\S]*?-----END (?:[A-Z0-9]+ )*PRIVATE KEY-----)?`),
		Redact:   true,
	},
	{
		ID:       "destructive-rm-rf-root",
		Category: CategoryDestructive,
		Severity: SeverityCritical,
		Summary:  "Destructive recursive delete targeting root or home directory",
		Pattern:  regexp.MustCompile(`(?i)\brm\s+(?:-[a-z]*r[a-z]*f[a-z]*|-[a-z]*f[a-z]*r[a-z]*|--recursive\s+--force|--force\s+--recursive)\s+(?:/(?:\*|\s|$|;|&|\|)|~(?:/|\s|$|;|&|\|))`),
		Redact:   false,
	},
	{
		ID:       "destructive-curl-pipe-sh",
		Category: CategoryDestructive,
		Severity: SeverityCritical,
		Summary:  "Remote script piped directly into shell execution",
		Pattern:  regexp.MustCompile(`(?i)\b(?:curl|wget)\b[^|\n;]*\|\s*(?:sudo\s+)?(?:ba|z|da|a)?sh\b`),
		Redact:   false,
	},
	{
		ID:       "destructive-git-force-push",
		Category: CategoryDestructive,
		Severity: SeverityWarning,
		Summary:  "Force push targeting main or master branch",
		Pattern:  regexp.MustCompile(`(?i)\bgit\s+push\b[^\n;]*(?:--force(?:-with-lease)?|\s-f\b)[^\n;]*\b(?:main|master)\b`),
		Redact:   false,
	},
}

// DefaultStreamRules returns a fresh copy of the built-in compiled StreamGuard rules.
func DefaultStreamRules() []StreamRule {
	out := make([]StreamRule, len(defaultStreamRules))
	copy(out, defaultStreamRules)
	return out
}

// NewStreamGuard constructs a StreamGuard with the given rules.
func NewStreamGuard(rules []StreamRule) *StreamGuard {
	cp := make([]StreamRule, len(rules))
	copy(cp, rules)
	return &StreamGuard{rules: cp}
}

// NewDefaultStreamGuard constructs a StreamGuard loaded with DefaultStreamRules.
func NewDefaultStreamGuard() *StreamGuard {
	return NewStreamGuard(DefaultStreamRules())
}

// Scan evaluates text line-by-line against all configured rules and returns structured hits
// without duplicating alerts for the same rule on the same line.
func (g *StreamGuard) Scan(text string) []GuardHit {
	if g == nil || text == "" || len(g.rules) == 0 {
		return nil
	}
	var hits []GuardHit
	lines := strings.Split(text, "\n")
	for i, line := range lines {
		if line == "" {
			continue
		}
		lineNo := i + 1
		for _, rule := range g.rules {
			if rule.Pattern == nil {
				continue
			}
			if rule.Pattern.MatchString(line) {
				hits = append(hits, GuardHit{
					RuleID:   rule.ID,
					Category: rule.Category,
					Severity: rule.Severity,
					Summary:  rule.Summary,
					Line:     lineNo,
				})
			}
		}
	}
	return hits
}

// RedactSecrets masks all matches of redactable secret rules with [REDACTED:<rule-id>] while
// preserving surrounding log text, and returns deduplicated per-line hits for the redacted rules.
func (g *StreamGuard) RedactSecrets(text string) (redacted string, hits []GuardHit) {
	if g == nil || text == "" || len(g.rules) == 0 {
		return text, nil
	}
	redacted = text
	type hitKey struct {
		ruleID string
		line   int
	}
	seen := make(map[hitKey]struct{})

	for _, rule := range g.rules {
		if !rule.Redact || rule.Pattern == nil {
			continue
		}
		locs := rule.Pattern.FindAllStringIndex(text, -1)
		if len(locs) == 0 {
			continue
		}
		for _, loc := range locs {
			lineNo := 1 + strings.Count(text[:loc[0]], "\n")
			key := hitKey{ruleID: rule.ID, line: lineNo}
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			hits = append(hits, GuardHit{
				RuleID:   rule.ID,
				Category: rule.Category,
				Severity: rule.Severity,
				Summary:  rule.Summary,
				Line:     lineNo,
			})
		}
		replacement := "[REDACTED:" + rule.ID + "]"
		redacted = rule.Pattern.ReplaceAllString(redacted, replacement)
	}
	return redacted, hits
}
