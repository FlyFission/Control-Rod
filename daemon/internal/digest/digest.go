// Package digest computes canonical digests of Control Rod records.
//
// Records are hashed as RFC 8785 canonical JSON so the Go daemon, the Rust kernel, the Python
// SDK and the browser compute identical digests. RFC 8785 alone leaves room for implementations
// to disagree, so every implementation also enforces the same profile and is tested against
// spec/vectors/canonical-digest.json:
//
//   - numbers are integers with |n| <= 2^53-1 (no fractions, exponents or negative zero);
//     engineering values are decimal strings with units;
//   - no object has the same key twice;
//   - containers nest at most MaxDepth deep.
package digest

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gowebpki/jcs"
)

// MaxSafeInteger is the largest integer every implementation represents exactly (2^53-1).
const MaxSafeInteger int64 = 1<<53 - 1

// MaxDepth is the deepest container nesting a record may have.
const MaxDepth = 64

// ErrInvalidJSON wraps every syntax error, including lone surrogates and invalid UTF-8.
var ErrInvalidJSON = errors.New("invalid JSON")

// ErrNumberNotAllowed reports a number that is not an integer within +/-(2^53-1).
type ErrNumberNotAllowed struct{ Pointer string }

func (e ErrNumberNotAllowed) Error() string {
	return fmt.Sprintf("number at %s is not a safe integer: use a decimal string with units", e.Pointer)
}

// ErrDuplicateKey reports an object that repeats a key.
type ErrDuplicateKey struct{ Pointer string }

func (e ErrDuplicateKey) Error() string { return "duplicate key at " + e.Pointer }

// ErrTooDeep reports a container nested deeper than MaxDepth.
type ErrTooDeep struct{ Pointer string }

func (e ErrTooDeep) Error() string {
	return fmt.Sprintf("container at %s nests deeper than %d", e.Pointer, MaxDepth)
}

// CanonicalSHA256 returns the lowercase hex SHA-256 of the RFC 8785 form of data.
func CanonicalSHA256(data []byte) (string, error) {
	if !utf8.Valid(data) {
		return "", fmt.Errorf("%w: not UTF-8", ErrInvalidJSON)
	}
	if err := checkSurrogates(data); err != nil {
		return "", err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	if err := check(dec, "", 0); err != nil {
		return "", err
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return "", fmt.Errorf("%w: trailing data", ErrInvalidJSON)
	}
	canonical, err := jcs.Transform(data)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

// check walks one value from the token stream and returns the first violation in document order.
func check(dec *json.Decoder, pointer string, depth int) error {
	at := pointer
	if at == "" {
		at = "/"
	}
	tok, err := dec.Token()
	if err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidJSON, err)
	}
	switch t := tok.(type) {
	case json.Number:
		return checkNumber(string(t), at)
	case json.Delim:
		if depth >= MaxDepth {
			return ErrTooDeep{Pointer: at}
		}
		if t == '[' {
			for i := 0; dec.More(); i++ {
				if err := check(dec, pointer+"/"+strconv.Itoa(i), depth+1); err != nil {
					return err
				}
			}
		} else {
			seen := map[string]bool{}
			for dec.More() {
				keyTok, err := dec.Token()
				if err != nil {
					return fmt.Errorf("%w: %v", ErrInvalidJSON, err)
				}
				key, _ := keyTok.(string)
				child := pointer + "/" + strings.ReplaceAll(strings.ReplaceAll(key, "~", "~0"), "/", "~1")
				if seen[key] {
					return ErrDuplicateKey{Pointer: child}
				}
				seen[key] = true
				if err := check(dec, child, depth+1); err != nil {
					return err
				}
			}
		}
		if _, err := dec.Token(); err != nil { // the closing delimiter
			return fmt.Errorf("%w: %v", ErrInvalidJSON, err)
		}
	}
	return nil
}

func checkNumber(text, at string) error {
	// JSON forbids leading zeros, so "-0" is the only spelling of negative zero.
	if text == "-0" || strings.ContainsAny(text, ".eE") {
		return ErrNumberNotAllowed{Pointer: at}
	}
	n, err := strconv.ParseInt(text, 10, 64)
	if err != nil || n > MaxSafeInteger || n < -MaxSafeInteger {
		return ErrNumberNotAllowed{Pointer: at}
	}
	return nil
}

// checkSurrogates refuses \u escapes that leave a UTF-16 surrogate unpaired. Go's decoder
// would replace them with U+FFFD; the other implementations refuse them.
func checkSurrogates(data []byte) error {
	escape := func(i int) (rune, bool) {
		if i+6 > len(data) || data[i] != '\\' || data[i+1] != 'u' {
			return 0, false
		}
		v, err := strconv.ParseUint(string(data[i+2:i+6]), 16, 16)
		return rune(v), err == nil
	}
	for i := 0; i < len(data); i++ {
		if data[i] != '\\' || i+1 >= len(data) {
			continue
		}
		if data[i+1] != 'u' {
			i++ // skip the escaped character, which may itself be a backslash
			continue
		}
		r, ok := escape(i)
		if !ok {
			i++
			continue
		}
		switch {
		case r >= 0xD800 && r <= 0xDBFF:
			low, ok := escape(i + 6)
			if !ok || low < 0xDC00 || low > 0xDFFF {
				return fmt.Errorf("%w: lone surrogate", ErrInvalidJSON)
			}
			i += 11
		case r >= 0xDC00 && r <= 0xDFFF:
			return fmt.Errorf("%w: lone surrogate", ErrInvalidJSON)
		default:
			i += 5
		}
	}
	return nil
}
