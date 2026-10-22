package digest

import (
	"errors"
	"testing"
)

// The shared vector: sha256 of the canonical bytes {"a":"x","b":1}. Checked in every language.
const sharedVector = "cdab067e9f3beb32d1252cfd63e492592fecbf591b0d08cadb24bb17f3864246"

func TestSharedVector(t *testing.T) {
	got, err := CanonicalSHA256([]byte(`{"b":1,"a":"x"}`))
	if err != nil {
		t.Fatal(err)
	}
	if got != sharedVector {
		t.Fatalf("got %s, want %s", got, sharedVector)
	}
}

func TestKeyOrderDoesNotMatter(t *testing.T) {
	a, _ := CanonicalSHA256([]byte(`{"b":1,"a":"x","c":{"z":true,"y":null}}`))
	b, _ := CanonicalSHA256([]byte(`{ "c": {"y": null, "z": true}, "a": "x", "b": 1 }`))
	if a != b {
		t.Fatalf("digests differ: %s vs %s", a, b)
	}
}

func TestFloatsAreRefused(t *testing.T) {
	_, err := CanonicalSHA256([]byte(`{"exports":[{"value":42.5}]}`))
	var target ErrFloatNotAllowed
	if !errors.As(err, &target) || target.Pointer != "/exports/0/value" {
		t.Fatalf("want float refusal at /exports/0/value, got %v", err)
	}
}
