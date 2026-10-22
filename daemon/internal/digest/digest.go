// Package digest computes canonical digests of Control Rod records.
//
// Records are hashed as RFC 8785 canonical JSON so the Go daemon, the Rust kernel and the
// browser compute identical digests. Non-integer JSON numbers are refused: engineering
// values must be decimal strings with units.
package digest

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/gowebpki/jcs"
)

// ErrFloatNotAllowed reports a non-integer number and its JSON pointer.
type ErrFloatNotAllowed struct{ Pointer string }

func (e ErrFloatNotAllowed) Error() string {
	return fmt.Sprintf("non-integer number at %s: use a decimal string with units", e.Pointer)
}

// CanonicalSHA256 returns the lowercase hex SHA-256 of the RFC 8785 form of data.
func CanonicalSHA256(data []byte) (string, error) {
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.UseNumber()
	var v any
	if err := dec.Decode(&v); err != nil {
		return "", fmt.Errorf("invalid JSON: %w", err)
	}
	if err := rejectFloats(v, ""); err != nil {
		return "", err
	}
	canonical, err := jcs.Transform(data)
	if err != nil {
		return "", fmt.Errorf("canonicalize: %w", err)
	}
	sum := sha256.Sum256(canonical)
	return hex.EncodeToString(sum[:]), nil
}

func rejectFloats(v any, pointer string) error {
	switch t := v.(type) {
	case json.Number:
		if _, err := t.Int64(); err != nil {
			if pointer == "" {
				pointer = "/"
			}
			return ErrFloatNotAllowed{Pointer: pointer}
		}
	case []any:
		for i, item := range t {
			if err := rejectFloats(item, fmt.Sprintf("%s/%d", pointer, i)); err != nil {
				return err
			}
		}
	case map[string]any:
		for k, item := range t {
			escaped := strings.ReplaceAll(strings.ReplaceAll(k, "~", "~0"), "/", "~1")
			if err := rejectFloats(item, pointer+"/"+escaped); err != nil {
				return err
			}
		}
	}
	return nil
}
