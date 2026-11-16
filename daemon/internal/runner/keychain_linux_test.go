//go:build linux

package runner

import (
	"bytes"
	"errors"
	"testing"
)

func TestSecretToolCreatesOnlyWhenStderrIsEmpty(t *testing.T) {
	t.Setenv("CONTROLROD_TEST_ATTESTATION_KEY", "")
	t.Setenv("CONTROLROD_ALLOW_FAKE", "")
	prev := keyCommand
	t.Cleanup(func() { keyCommand = prev })
	var stored []byte
	keyCommand = func(name string, args []string, stdin []byte) ([]byte, []byte, int, error) {
		if name != "secret-tool" || len(args) == 0 {
			t.Fatalf("command %s %v", name, args)
		}
		switch args[0] {
		case "lookup":
			if stored == nil {
				return nil, nil, 1, nil
			}
			return stored, nil, 0, nil
		case "store":
			if len(stdin) == 0 {
				t.Fatal("store read no stdin")
			}
			stored = append([]byte(nil), stdin...)
			return nil, nil, 0, nil
		default:
			t.Fatalf("args %v", args)
			return nil, nil, 1, nil
		}
	}
	first, err := InitSigningKey()
	if err != nil {
		t.Fatal(err)
	}
	again, err := InitSigningKey()
	if err != nil || !bytes.Equal(first, again) {
		t.Fatalf("second init: %v", err)
	}
	keyCommand = func(name string, args []string, stdin []byte) ([]byte, []byte, int, error) {
		if len(args) > 0 && args[0] == "store" {
			t.Fatal("a D-Bus failure replaced the key")
		}
		return nil, []byte("GDBus.Error: org.freedesktop.DBus.Error.ServiceUnknown"), 1, nil
	}
	if _, err := InitSigningKey(); !errors.Is(err, errKeychainUnavailable) || errors.Is(err, errKeyNotFound) {
		t.Fatal(err)
	}
}
