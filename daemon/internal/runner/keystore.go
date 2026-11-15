package runner

import (
	"bytes"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
)

var (
	errKeychainUnavailable = errors.New("the OS keychain is not available, so a counted check cannot be signed")
	errKeyNotFound         = errors.New("the daemon signing key is not in the OS keychain")
)

// keyCommand runs a keychain helper. Tests replace it. Production uses the OS binary.
var keyCommand = defaultKeyCommand

func defaultKeyCommand(name string, args []string, stdin []byte) ([]byte, int, error) {
	cmd := exec.Command(name, args...)
	if len(stdin) > 0 {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	out, err := cmd.CombinedOutput()
	if err == nil {
		return out, 0, nil
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return out, exit.ExitCode(), nil
	}
	return out, -1, err
}

// SigningKey returns the daemon's existing Ed25519 private key.
// It does not create one. A 0600 file is used only when CONTROLROD_ALLOW_FAKE=1
// and CONTROLROD_TEST_ATTESTATION_KEY names that file. Otherwise the OS keychain
// is required. A missing key or an unavailable keychain refuses; nothing is written.
func SigningKey() (ed25519.PrivateKey, error) {
	if k, err, used := testFileKey(); used {
		return k, err
	}
	return lookupOSKey()
}

// InitSigningKey returns the existing key, or creates one when the keychain
// reports that it is absent. It does not replace a key that is already there,
// and it does not create one when the keychain is locked or unreachable.
func InitSigningKey() (ed25519.PrivateKey, error) {
	if k, err, used := testFileKey(); used {
		return k, err
	}
	k, err := lookupOSKey()
	if err == nil {
		return k, nil
	}
	if !errors.Is(err, errKeyNotFound) {
		return nil, err
	}
	_, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	if err := storeOSKey(priv); err != nil {
		return nil, err
	}
	return priv, nil
}

// classifyKeychain separates "no item" from a keychain that cannot be used.
// An empty or unrelated failure is unavailable, so a key is never invented over it.
func classifyKeychain(code int, out []byte) error {
	if code == 0 {
		return nil
	}
	text := strings.ToLower(string(out))
	if strings.Contains(text, "could not be found") || strings.Contains(text, "does not exist") || strings.Contains(text, "item not found") {
		return errKeyNotFound
	}
	if text == "" {
		return errKeychainUnavailable
	}
	return fmt.Errorf("%w: %s", errKeychainUnavailable, strings.TrimSpace(text))
}

func parseStoredKey(out []byte) (ed25519.PrivateKey, error) {
	text := strings.TrimSpace(string(out))
	raw, err := base64.StdEncoding.DecodeString(text)
	if err != nil || len(raw) != ed25519.PrivateKeySize {
		return nil, errors.New("the OS keychain entry is not an Ed25519 private key")
	}
	return ed25519.PrivateKey(raw), nil
}

func encodeStoredKey(k ed25519.PrivateKey) []byte {
	return []byte(base64.StdEncoding.EncodeToString(k))
}

// testFileKey reports used when the test path is set, even if it then refuses.
func testFileKey() (ed25519.PrivateKey, error, bool) {
	path := os.Getenv("CONTROLROD_TEST_ATTESTATION_KEY")
	if path == "" {
		return nil, nil, false
	}
	if os.Getenv("CONTROLROD_ALLOW_FAKE") != "1" {
		return nil, errors.New("refusing the file signing key: CONTROLROD_TEST_ATTESTATION_KEY is read only when CONTROLROD_ALLOW_FAKE=1"), true
	}
	fi, err := os.Lstat(path)
	if err != nil {
		return nil, fmt.Errorf("refusing the file signing key: %w", err), true
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("refusing the file signing key: the path is a symlink"), true
	}
	if !fi.Mode().IsRegular() {
		return nil, errors.New("refusing the file signing key: the path is not a regular file"), true
	}
	if fi.Mode().Perm() != 0o600 {
		return nil, fmt.Errorf("refusing the file signing key: mode is %o, want 0600", fi.Mode().Perm()), true
	}
	if !fileOwnedByUser(fi) {
		return nil, errors.New("refusing the file signing key: it is not owned by this user"), true
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("refusing the file signing key: %w", err), true
	}
	if len(b) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("refusing the file signing key: want %d bytes", ed25519.PrivateKeySize), true
	}
	return ed25519.PrivateKey(b), nil, true
}
