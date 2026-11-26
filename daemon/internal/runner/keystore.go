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
	"path/filepath"
	"strings"
)

var (
	errKeychainUnavailable = errors.New("the OS keychain is not available, so a counted check cannot be signed")
	errKeyNotFound         = errors.New("the daemon signing key has not been created yet")
)

// keyCommand runs a keychain helper. Tests replace it. Production uses the OS binary.
var keyCommand = defaultKeyCommand

func defaultKeyCommand(name string, args []string, stdin []byte) (stdout, stderr []byte, code int, err error) {
	cmd := exec.Command(name, args...)
	if len(stdin) > 0 {
		cmd.Stdin = bytes.NewReader(stdin)
	}
	var outb, errb bytes.Buffer
	cmd.Stdout = &outb
	cmd.Stderr = &errb
	err = cmd.Run()
	if err == nil {
		return outb.Bytes(), errb.Bytes(), 0, nil
	}
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return outb.Bytes(), errb.Bytes(), exit.ExitCode(), nil
	}
	return outb.Bytes(), errb.Bytes(), -1, err
}

// SigningKey returns the daemon's existing Ed25519 private key. It does not create one.
//
// The key lives in <home>/signing.key, mode 0600, beside the daemon's token. The macOS keychain
// ties an item to the exact binary that made it, so every rebuild (each `controlrod update`)
// raised a password dialog, and the daemon blocked on it at the moment a passed check was signed:
// its runs were lost and no card finished (2026-11-26). A headless Linux host has no keychain at
// all. CONTROLROD_SIGNING_KEY_STORE=keychain keeps the key in the OS keychain instead. Tests may
// point CONTROLROD_TEST_ATTESTATION_KEY at a 0600 file when CONTROLROD_ALLOW_FAKE=1.
func SigningKey() (ed25519.PrivateKey, error) {
	if k, err, used := testFileKey(); used {
		return k, err
	}
	if useKeychain() {
		return lookupOSKey()
	}
	path, err := signingKeyPath()
	if err != nil {
		return nil, err
	}
	if _, err := os.Lstat(path); errors.Is(err, os.ErrNotExist) {
		return nil, errKeyNotFound
	}
	return readKeyFile(path)
}

// InitSigningKey returns the existing key, or creates one when there is none. It never replaces
// a key that is already there, and it creates none when the store cannot be read.
func InitSigningKey() (ed25519.PrivateKey, error) {
	if k, err, used := testFileKey(); used {
		return k, err
	}
	k, err := SigningKey()
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
	if useKeychain() {
		if err := storeOSKey(priv); err != nil {
			return nil, err
		}
		return priv, nil
	}
	path, err := signingKeyPath()
	if err != nil {
		return nil, err
	}
	if err := writeKeyFile(path, priv); err != nil {
		return nil, err
	}
	// Another daemon may have written its key first: the file on disk is the key.
	return readKeyFile(path)
}

func useKeychain() bool { return os.Getenv("CONTROLROD_SIGNING_KEY_STORE") == "keychain" }

func signingKeyPath() (string, error) {
	home, err := Home(os.Getenv)
	if err != nil {
		return "", err
	}
	return filepath.Join(home, "signing.key"), nil
}

// writeKeyFile creates the key file with mode 0600, never over an existing one.
func writeKeyFile(path string, k ed25519.PrivateKey) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if errors.Is(err, os.ErrExist) {
		return nil
	}
	if err != nil {
		return fmt.Errorf("write the signing key: %w", err)
	}
	if _, err := f.Write(k); err != nil {
		f.Close()
		os.Remove(path)
		return fmt.Errorf("write the signing key: %w", err)
	}
	return f.Close()
}

// classifyKeychain reads the helper's exit code and stderr, never its stdout.
// secret-tool lookup exits 1 with empty stderr when the item is absent.
// A GError or D-Bus message means the keychain cannot be used, so no key is created.
func classifyKeychain(code int, stderr []byte) error {
	if code == 0 {
		return nil
	}
	text := strings.TrimSpace(string(stderr))
	low := strings.ToLower(text)
	if strings.Contains(low, "dbus") || strings.Contains(low, "d-bus") || strings.Contains(low, "gerror") ||
		strings.Contains(low, "org.freedesktop") || strings.Contains(low, "/org/freedesktop/") {
		return fmt.Errorf("%w: %s", errKeychainUnavailable, text)
	}
	if strings.Contains(low, "could not be found") || strings.Contains(low, "does not exist") || strings.Contains(low, "item not found") {
		return errKeyNotFound
	}
	if code == 1 && text == "" {
		return errKeyNotFound
	}
	if text == "" {
		return errKeychainUnavailable
	}
	return fmt.Errorf("%w: %s", errKeychainUnavailable, text)
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
	k, err := readKeyFile(path)
	return k, err, true
}

// readKeyFile reads a raw Ed25519 private key from a regular 0600 file this user owns.
func readKeyFile(path string) (ed25519.PrivateKey, error) {
	fi, err := os.Lstat(path)
	if err != nil {
		return nil, fmt.Errorf("refusing the file signing key: %w", err)
	}
	if fi.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("refusing the file signing key: the path is a symlink")
	}
	if !fi.Mode().IsRegular() {
		return nil, errors.New("refusing the file signing key: the path is not a regular file")
	}
	if fi.Mode().Perm() != 0o600 {
		return nil, fmt.Errorf("refusing the file signing key: mode is %o, want 0600", fi.Mode().Perm())
	}
	if !fileOwnedByUser(fi) {
		return nil, errors.New("refusing the file signing key: it is not owned by this user")
	}
	b, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("refusing the file signing key: %w", err)
	}
	if len(b) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("refusing the file signing key: want %d bytes", ed25519.PrivateKeySize)
	}
	return ed25519.PrivateKey(b), nil
}
