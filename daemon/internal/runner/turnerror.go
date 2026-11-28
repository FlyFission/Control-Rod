package runner

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode/utf8"
)

// TurnError is what an agent CLI itself said about a failed turn: a fixed reason Control Rod can
// put in plain words, and the CLI's own text, clipped. It is read from the CLI's end-of-turn report
// (Claude Code's error result, Codex's turn.failed or error event) or, after an error exit, from a
// stderr line that matches a known reason. It only explains a failure the daemon already found; it
// never decides one.
type TurnError struct {
	// Reason is one of the turnReason* values, or "" when the text matched none of them.
	Reason string
	// Said is the CLI's own words, on one line and at most maxSaid bytes.
	Said string
}

const (
	turnReasonRateLimit = "rate-limit"
	turnReasonSignIn    = "sign-in"
	turnReasonRefused   = "refused"
	turnReasonContext   = "context"
	turnReasonMaxTurns  = "max-turns"
	turnReasonService   = "service"
)

// maxSaid bounds the CLI's own words carried into a run's error.
const maxSaid = 300

// turnReasonWords is each reason in plain words, with what the person can do about it.
var turnReasonWords = map[string]string{
	turnReasonRateLimit: "The agent's usage limit is reached. Wait for it to reset, or set the card to another agent.",
	turnReasonSignIn:    "The agent's sign-in has expired or was refused. Sign in to the agent again on this computer, then run the card again.",
	turnReasonRefused:   "The model refused this request. Reword the card, or set it to another agent.",
	turnReasonContext:   "The work did not fit in the model's context window. Split the card into smaller parts, or pick a model with a larger window.",
	turnReasonMaxTurns:  "The agent reached its turn limit before it finished. Run the card again, or split it into smaller parts.",
	turnReasonService:   "The agent's service had a problem on its side. Try again in a few minutes.",
}

// turnReasonPatterns places a CLI's text in a reason. The first match wins, so the more specific
// reasons come first. Matched case-insensitively.
var turnReasonPatterns = []struct {
	reason string
	re     *regexp.Regexp
}{
	{turnReasonContext, regexp.MustCompile(`(?i)prompt is too long|context (window|length)|maximum context|too many tokens|input exceeds|context_length_exceeded`)},
	{turnReasonRateLimit, regexp.MustCompile(`(?i)usage limit|rate.?limit|too many requests|\b429\b|quota|limit reached|hit your (usage )?limit`)},
	{turnReasonSignIn, regexp.MustCompile(`(?i)invalid api key|/login|not logged in|log ?in again|sign ?in again|oauth token|token (has )?expired|access token|authenticat|unauthori[sz]ed|\b401\b|\b403\b|credentials`)},
	{turnReasonRefused, regexp.MustCompile(`(?i)usage policy|refus|unable to respond to this request|content (policy|filter)|safety (system|policy)`)},
	{turnReasonMaxTurns, regexp.MustCompile(`(?i)error_max_turns|max(imum)? turns`)},
	{turnReasonService, regexp.MustCompile(`(?i)overloaded|\b5\d\d\b|internal server error|service unavailable|bad gateway|timed out|connection (reset|refused)`)},
}

// classifyTurnText places a CLI's text in a reason, or "".
func classifyTurnText(s string) string {
	for _, p := range turnReasonPatterns {
		if p.re.MatchString(s) {
			return p.reason
		}
	}
	return ""
}

// oneLine puts text on one line and clips it to maxSaid bytes at a rune boundary.
func oneLine(s string) string {
	s = strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if r < 0x20 || r == 0x7f || r == ' ' || r == ' ' {
			return ' '
		}
		return r
	}, s)), " ")
	if len(s) <= maxSaid {
		return s
	}
	cut := maxSaid
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut] + "…"
}

// TurnErrorOf reads a failed turn's report from one stdout line: a Claude Code result with is_error
// or an error subtype, a Codex turn.failed, or a Codex error event. ok is false for any other line.
func TurnErrorOf(line string) (TurnError, bool) {
	if !strings.HasPrefix(line, "{") {
		return TurnError{}, false
	}
	var ev struct {
		Type    string          `json:"type"`
		Subtype string          `json:"subtype"`
		IsError bool            `json:"is_error"`
		Result  json.RawMessage `json:"result"`
		Message string          `json:"message"`
		Error   json.RawMessage `json:"error"`
		Status  int             `json:"api_error_status"`
	}
	if json.Unmarshal([]byte(line), &ev) != nil {
		return TurnError{}, false
	}
	var said string
	switch ev.Type {
	case "result":
		if !ev.IsError && !strings.HasPrefix(ev.Subtype, "error") {
			return TurnError{}, false
		}
		var text string
		_ = json.Unmarshal(ev.Result, &text)
		said = text
		if said == "" {
			said = ev.Subtype
		}
	case "turn.failed", "error":
		said = ev.Message
		if said == "" && len(ev.Error) > 0 {
			var e struct {
				Message string `json:"message"`
			}
			if json.Unmarshal(ev.Error, &e) == nil && e.Message != "" {
				said = e.Message
			} else {
				_ = json.Unmarshal(ev.Error, &said)
			}
		}
	default:
		return TurnError{}, false
	}
	said = oneLine(said)
	reason := classifyTurnText(ev.Subtype + " " + said)
	switch {
	case reason != "":
	case ev.Status == 429:
		reason = turnReasonRateLimit
	case ev.Status == 401 || ev.Status == 403:
		reason = turnReasonSignIn
	case ev.Status >= 500:
		reason = turnReasonService
	}
	if said == "" && reason == "" {
		return TurnError{}, false
	}
	return TurnError{Reason: reason, Said: said}, true
}

// stderrTurnError reads a stderr line that names a known reason, so an agent that exits with an
// error status before any end-of-turn report still says why. A line that matches no reason gives
// nothing: arbitrary stderr is never put in a run's error.
func stderrTurnError(line string) (TurnError, bool) {
	text, ok := strings.CutPrefix(line, "[stderr] ")
	if !ok {
		return TurnError{}, false
	}
	said := oneLine(text)
	if said == "" {
		return TurnError{}, false
	}
	reason := classifyTurnText(said)
	if reason == "" || reason == turnReasonService {
		// A stderr line about a timeout or a 5xx is too often a retried request the CLI recovered from.
		return TurnError{}, false
	}
	return TurnError{Reason: reason, Said: said}, true
}

// Words is the turn error in plain words for the person: the reason and what to do, then the
// CLI's own words.
func (e TurnError) Words() string {
	words := turnReasonWords[e.Reason]
	switch {
	case words != "" && e.Said != "":
		return words + " The agent said: \"" + e.Said + "\""
	case words != "":
		return words
	case e.Said != "":
		return "The agent said: \"" + e.Said + "\""
	}
	return ""
}
