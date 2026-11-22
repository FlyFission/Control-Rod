// Package battlescars provides operational hardening primitives and defensive
// guards against recurring runtime failure modes: instruction-wrapper leakage,
// non-idempotent stop signals, unbounded delivery retries, UTF-8 filename
// collision overflow, transient credential-probe sign-outs, and naive timestamp
// drift.
package battlescars

import (
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// internalWrapperTagNames lists the XML-style wrapper elements used for
// standing instructions, worker report envelopes, system reminders, and pasted
// content blocks that must never leak into external notifications, status
// summaries, or user-visible receipts.
var internalWrapperTagNames = []string{
	"ao-standing-instructions",
	"ao-worker-reports",
	"system-reminder",
	"pasted_content",
}

// ansiEscapeRe matches CSI, OSC, and 2-byte ANSI terminal escape sequences.
var ansiEscapeRe = regexp.MustCompile(
	`\x1b\[[0-?]*[ -/]*[@-~]` +
		`|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)` +
		`|\x1b[@-Z\\-_]`,
)

// SanitizeExternalText strips internal standing-instruction and wrapper tags
// (<ao-standing-instructions>...</ao-standing-instructions>,
// <ao-worker-reports>...</ao-worker-reports>,
// <system-reminder>...</system-reminder>,
// <pasted_content>...</pasted_content>, including nested or unclosed openers
// and closers), removes ANSI escape sequences and ASCII/Unicode control
// characters (collapsing newlines, carriage returns, and tabs into single
// spaces for single-line external status/notification/receipt strings), and
// truncates cleanly on a valid UTF-8 rune boundary within maxBytes.
//
// If maxBytes <= 0, the sanitized string is returned without byte truncation.
func SanitizeExternalText(s string, maxBytes int) string {
	if s == "" {
		return ""
	}

	cleaned := stripInternalWrapperBlocks(s)
	cleaned = ansiEscapeRe.ReplaceAllString(cleaned, "")
	cleaned = stripControlAndCollapseLineBreaks(cleaned)

	if maxBytes > 0 && len(cleaned) > maxBytes {
		cleaned = truncateUTF8Bytes(cleaned, maxBytes)
		cleaned = strings.TrimSpace(cleaned)
	}
	return cleaned
}

// stripInternalWrapperBlocks removes paired wrapper blocks (handling nesting
// and case-insensitive tag names), unclosed opening tags (truncating from an
// unclosed opener to the end of the string so half-streamed instructions do
// not leak), and stray closing tags.
func stripInternalWrapperBlocks(s string) string {
	out := s
	for _, tag := range internalWrapperTagNames {
		out = stripSingleTagType(out, tag)
	}
	return out
}

func stripSingleTagType(s, tag string) string {
	openPrefix := "<" + tag
	closeTag := "</" + tag + ">"

	for {
		lower := strings.ToLower(s)
		openIdx := findOpeningTag(lower, openPrefix)
		closeIdx := strings.Index(lower, closeTag)

		if openIdx == -1 && closeIdx == -1 {
			break
		}

		// Stray closing tag before any opening tag: remove just the closing tag.
		if openIdx == -1 || (closeIdx != -1 && closeIdx < openIdx) {
			s = s[:closeIdx] + " " + s[closeIdx+len(closeTag):]
			continue
		}

		// Find where the opening tag token '>' ends.
		openTagEndRel := strings.IndexByte(s[openIdx:], '>')
		if openTagEndRel == -1 {
			// Malformed unclosed '<tag...' at end of input: drop from openIdx onward.
			s = s[:openIdx]
			break
		}
		openTagEnd := openIdx + openTagEndRel + 1

		// Self-closing tag `<tag .../>`: remove just the tag.
		if openTagEnd >= 2 && s[openTagEnd-2] == '/' {
			s = s[:openIdx] + " " + s[openTagEnd:]
			continue
		}

		// Walk forward tracking nesting depth for this tag.
		depth := 1
		cursor := openTagEnd
		matchedEnd := -1
		for cursor < len(s) && depth > 0 {
			remLower := strings.ToLower(s[cursor:])
			nextOpen := findOpeningTag(remLower, openPrefix)
			nextClose := strings.Index(remLower, closeTag)

			if nextClose == -1 {
				break
			}
			if nextOpen != -1 && nextOpen < nextClose {
				tagCloseRel := strings.IndexByte(remLower[nextOpen:], '>')
				if tagCloseRel == -1 {
					break
				}
				// Ignore self-closing inner tags for depth increment.
				if tagCloseRel < 1 || remLower[nextOpen+tagCloseRel-1] != '/' {
					depth++
				}
				cursor += nextOpen + tagCloseRel + 1
			} else {
				depth--
				cursor += nextClose + len(closeTag)
				if depth == 0 {
					matchedEnd = cursor
				}
			}
		}

		if matchedEnd != -1 {
			s = s[:openIdx] + " " + s[matchedEnd:]
		} else {
			// Unclosed opening tag: fail closed by dropping everything from the
			// unclosed wrapper opener to the end of the string so partial standing
			// instructions never leak into external previews.
			s = s[:openIdx]
			break
		}
	}
	return s
}

// findOpeningTag finds `<tag>` or `<tag ...>` in lower, ensuring `<tag-other>`
// does not false-match.
func findOpeningTag(lower, openPrefix string) int {
	offset := 0
	for offset < len(lower) {
		idx := strings.Index(lower[offset:], openPrefix)
		if idx == -1 {
			return -1
		}
		absIdx := offset + idx
		after := absIdx + len(openPrefix)
		if after < len(lower) {
			ch := lower[after]
			if ch == '>' || ch == '/' || ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r' {
				return absIdx
			}
		} else {
			// Prefix is at the very end of the string (truncated opener).
			return absIdx
		}
		offset = absIdx + len(openPrefix)
	}
	return -1
}

func stripControlAndCollapseLineBreaks(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	lastSpace := true // trim leading whitespace

	for i := 0; i < len(s); {
		r, width := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError && width == 1 {
			// Drop invalid UTF-8 bytes.
			i++
			continue
		}
		i += width

		// Collapse CR, LF, Tab, and Unicode line/paragraph separators into a single ASCII space.
		if r == '\n' || r == '\r' || r == '\t' || r == '\u2028' || r == '\u2029' || unicode.IsSpace(r) {
			if !lastSpace {
				b.WriteByte(' ')
				lastSpace = true
			}
			continue
		}

		// Drop all remaining ASCII and Unicode C0/C1 control characters and format controls (e.g. NUL, BEL, BS, DEL).
		if unicode.IsControl(r) {
			continue
		}

		b.WriteRune(r)
		lastSpace = false
	}

	return strings.TrimSpace(b.String())
}

// truncateUTF8Bytes returns the longest prefix of s that is at most maxBytes
// long and ends on a valid UTF-8 rune boundary.
func truncateUTF8Bytes(s string, maxBytes int) string {
	if maxBytes <= 0 {
		return ""
	}
	if len(s) <= maxBytes {
		return s
	}
	cut := maxBytes
	for cut > 0 && !utf8.RuneStart(s[cut]) {
		cut--
	}
	return s[:cut]
}
