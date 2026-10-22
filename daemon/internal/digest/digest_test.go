package digest

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"testing"
)

type vectorFile struct {
	MaxSafeInteger int64 `json:"max_safe_integer"`
	MaxDepth       int   `json:"max_depth"`
	Valid          []struct {
		Name, Input, Canonical string
	} `json:"valid"`
	Invalid []struct {
		Name, Input, Error, Pointer string
	} `json:"invalid"`
}

func loadVectors(t *testing.T) vectorFile {
	t.Helper()
	raw, err := os.ReadFile("../../../spec/vectors/canonical-digest.json")
	if err != nil {
		t.Fatal(err)
	}
	var v vectorFile
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

func TestProfileConstantsMatchTheVectorFile(t *testing.T) {
	v := loadVectors(t)
	if v.MaxSafeInteger != MaxSafeInteger || v.MaxDepth != MaxDepth {
		t.Fatalf("vector file says %d/%d, code says %d/%d", v.MaxSafeInteger, v.MaxDepth, MaxSafeInteger, MaxDepth)
	}
}

func TestValidVectorsHashTheirCanonicalForm(t *testing.T) {
	v := loadVectors(t)
	if len(v.Valid) < 10 {
		t.Fatalf("only %d valid vectors loaded", len(v.Valid))
	}
	for _, c := range v.Valid {
		sum := sha256.Sum256([]byte(c.Canonical))
		want := hex.EncodeToString(sum[:])
		got, err := CanonicalSHA256([]byte(c.Input))
		if err != nil || got != want {
			t.Errorf("%s: got %q, %v; want %q", c.Name, got, err, want)
		}
	}
}

func TestInvalidVectorsAreRefusedWithTheNamedError(t *testing.T) {
	v := loadVectors(t)
	if len(v.Invalid) < 18 {
		t.Fatalf("only %d invalid vectors loaded", len(v.Invalid))
	}
	for _, c := range v.Invalid {
		_, err := CanonicalSHA256([]byte(c.Input))
		var (
			number ErrNumberNotAllowed
			dup    ErrDuplicateKey
			deep   ErrTooDeep
		)
		switch c.Error {
		case "number":
			if !errors.As(err, &number) || number.Pointer != c.Pointer {
				t.Errorf("%s: want number error at %s, got %v", c.Name, c.Pointer, err)
			}
		case "duplicate_key":
			if !errors.As(err, &dup) || dup.Pointer != c.Pointer {
				t.Errorf("%s: want duplicate key at %s, got %v", c.Name, c.Pointer, err)
			}
		case "depth":
			if !errors.As(err, &deep) || deep.Pointer != c.Pointer {
				t.Errorf("%s: want depth error at %s, got %v", c.Name, c.Pointer, err)
			}
		case "invalid_json":
			if !errors.Is(err, ErrInvalidJSON) {
				t.Errorf("%s: want invalid JSON, got %v", c.Name, err)
			}
		default:
			t.Errorf("%s: unknown error kind %q", c.Name, c.Error)
		}
	}
}

// Go decodes invalid UTF-8 to U+FFFD instead of refusing it; the other languages take
// already-valid strings, so the Go entry point checks bytes itself.
func TestInvalidUTF8IsRefused(t *testing.T) {
	_, err := CanonicalSHA256([]byte("{\"s\":\"\xff\"}"))
	if !errors.Is(err, ErrInvalidJSON) {
		t.Fatalf("want invalid JSON, got %v", err)
	}
}
