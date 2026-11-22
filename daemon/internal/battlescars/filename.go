package battlescars

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"
)

// DefaultMaxFilenameBytes is the standard POSIX/Linux NAME_MAX byte limit (255).
const DefaultMaxFilenameBytes = 255

var (
	// ErrInvalidFilename is returned when a candidate filename is empty, dot-only,
	// not valid UTF-8, or contains path separators or control characters.
	ErrInvalidFilename = errors.New("battlescars: invalid filename")
	// ErrFilenameBudgetTooSmall is returned when maxBytes cannot accommodate
	// even the collision suffix and extension.
	ErrFilenameBudgetTooSmall = errors.New("battlescars: maxBytes too small for collision suffix and extension")
)

// SafeCollisionFilename appends a collision suffix ("-1", "-2", ...) before the
// file extension when attempt > 0 while guaranteeing that the final UTF-8 byte
// length never exceeds maxBytes (defaulting to 255 bytes when maxBytes <= 0).
//
// It rejects empty names, "." or "..", invalid UTF-8, path separators ('/' or
// '\'), and any ASCII/Unicode control characters (including NUL). When the base
// stem must be shortened to fit the collision suffix and extension within
// maxBytes, it truncates cleanly on a valid UTF-8 rune boundary.
func SafeCollisionFilename(name string, attempt int, maxBytes int) (string, error) {
	if maxBytes <= 0 {
		maxBytes = DefaultMaxFilenameBytes
	}
	if attempt < 0 {
		return "", fmt.Errorf("%w: negative collision attempt %d", ErrInvalidFilename, attempt)
	}
	if name == "" || name == "." || name == ".." {
		return "", fmt.Errorf("%w: empty or dot filename", ErrInvalidFilename)
	}
	if !utf8.ValidString(name) {
		return "", fmt.Errorf("%w: invalid UTF-8", ErrInvalidFilename)
	}
	for _, r := range name {
		if r == '/' || r == '\\' || r == 0 || unicode.IsControl(r) {
			return "", fmt.Errorf("%w: contains path separator or control character", ErrInvalidFilename)
		}
	}

	stem, ext := splitStemAndExt(name)
	suffix := ""
	if attempt > 0 {
		suffix = "-" + strconv.Itoa(attempt)
	}

	reserved := len(suffix) + len(ext)
	if reserved > maxBytes {
		return "", fmt.Errorf("%w: need %d bytes for %q, maxBytes is %d", ErrFilenameBudgetTooSmall, reserved, suffix+ext, maxBytes)
	}

	stemBudget := maxBytes - reserved
	if len(stem) > stemBudget {
		stem = truncateUTF8Bytes(stem, stemBudget)
	}
	if stem == "" && ext == "" && suffix == "" {
		return "", ErrFilenameBudgetTooSmall
	}
	// If stem existed originally and truncation left it empty when maxBytes == reserved,
	// ensure we needed at least 1 byte for stem unless the original file was purely a dotfile without stem.
	if stem == "" && len(name) > len(ext) && stemBudget < 1 {
		return "", fmt.Errorf("%w: no room left for base stem", ErrFilenameBudgetTooSmall)
	}

	result := stem + suffix + ext
	if result == "." || result == ".." || result == "" {
		return "", ErrInvalidFilename
	}
	return result, nil
}

// splitStemAndExt separates a base filename into (stem, ext).
// Leading dots on hidden files (e.g. ".env") are treated as part of the stem,
// whereas ".env.local" splits into (".env", ".local").
func splitStemAndExt(name string) (stem, ext string) {
	lastDot := strings.LastIndexByte(name, '.')
	if lastDot <= 0 {
		return name, ""
	}
	return name[:lastDot], name[lastDot:]
}
