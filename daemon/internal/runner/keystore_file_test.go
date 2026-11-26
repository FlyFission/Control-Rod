//go:build unix

package runner

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// The macOS keychain asked for a password after every rebuild, and the daemon blocked on that
// dialog while signing a passed check, so its runs were lost. The key now lives in a 0600 file.
func TestSigningKeyIsAPrivateFileInTheHome(t *testing.T) {
	home := t.TempDir()
	t.Setenv("CONTROLROD_HOME", home)
	t.Setenv("CONTROLROD_TEST_ATTESTATION_KEY", "")
	t.Setenv("CONTROLROD_SIGNING_KEY_STORE", "")
	called := false
	old := keyCommand
	keyCommand = func(string, []string, []byte) ([]byte, []byte, int, error) {
		called = true
		return nil, nil, 1, nil
	}
	t.Cleanup(func() { keyCommand = old })

	if _, err := SigningKey(); !errors.Is(err, errKeyNotFound) {
		t.Fatalf("before init: want errKeyNotFound, got %v", err)
	}
	k, err := InitSigningKey()
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(home, "signing.key")
	fi, err := os.Stat(path)
	if err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("key file: %v %v", fi, err)
	}
	again, err := InitSigningKey()
	if err != nil || !bytes.Equal(again, k) {
		t.Fatalf("a second init must return the same key: %v", err)
	}
	read, err := SigningKey()
	if err != nil || !bytes.Equal(read, k) {
		t.Fatalf("read back: %v", err)
	}
	if called {
		t.Fatal("the keychain must not be touched unless asked for")
	}
	if err := os.Chmod(path, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := SigningKey(); err == nil {
		t.Fatal("a key file others can read must be refused")
	}
}
