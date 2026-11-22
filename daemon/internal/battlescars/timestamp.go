package battlescars

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

// CanonicalUTCMilliLayout is the fixed-width 3-digit millisecond UTC timestamp
// layout whose lexical order matches chronological order across all same-era
// 4-digit years.
const CanonicalUTCMilliLayout = "2006-01-02T15:04:05.000Z"

// ErrInvalidTimestamp is returned when a timestamp string is empty, malformed,
// or lacks an explicit timezone designator ("Z" or "+/-HH:MM").
var ErrInvalidTimestamp = errors.New("battlescars: invalid or naive timestamp")

// NormalizeUTCTimestamp parses an RFC3339 or RFC3339Nano timestamp string,
// rejecting naive timezone-less strings or malformed inputs, converts the
// instant to UTC, and formats it in canonical fixed-width millisecond UTC layout
// ("2006-01-02T15:04:05.000Z") so lexical sorting matches chronological sorting.
func NormalizeUTCTimestamp(raw string) (time.Time, string, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return time.Time{}, "", fmt.Errorf("%w: empty timestamp", ErrInvalidTimestamp)
	}

	// Require ISO-8601 'T' separator (uppercase 'T' for strict RFC3339 consistency)
	// and an explicit timezone suffix ('Z' or '+/-HH:MM').
	tIdx := strings.IndexByte(trimmed, 'T')
	if tIdx <= 0 {
		return time.Time{}, "", fmt.Errorf("%w: missing 'T' separator in %q", ErrInvalidTimestamp, raw)
	}
	timePart := trimmed[tIdx+1:]
	if !hasExplicitTimezone(timePart) {
		return time.Time{}, "", fmt.Errorf("%w: missing explicit timezone offset in %q", ErrInvalidTimestamp, raw)
	}

	parsed, err := time.Parse(time.RFC3339Nano, trimmed)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("%w: %v", ErrInvalidTimestamp, err)
	}

	utc := parsed.UTC()
	formatted := utc.Format(CanonicalUTCMilliLayout)
	return utc, formatted, nil
}

func hasExplicitTimezone(timePart string) bool {
	if strings.HasSuffix(timePart, "Z") {
		return true
	}
	plusIdx := strings.LastIndexByte(timePart, '+')
	minusIdx := strings.LastIndexByte(timePart, '-')
	tzIdx := plusIdx
	if minusIdx > tzIdx {
		tzIdx = minusIdx
	}
	if tzIdx <= 0 {
		return false
	}
	offset := timePart[tzIdx+1:]
	return len(offset) == 5 && offset[2] == ':'
}
