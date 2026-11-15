//go:build linux

package runner

import (
	"crypto/ed25519"
	"errors"
	"os/exec"
)

func lookupOSKey() (ed25519.PrivateKey, error) {
	out, code, err := keyCommand("secret-tool", []string{"lookup", "service", "controlrod-daemon-signing", "username", "controlrod"}, nil)
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return nil, errKeychainUnavailable
		}
		return nil, err
	}
	if code != 0 {
		return nil, errKeyNotFound
	}
	return parseStoredKey(out)
}

func storeOSKey(k ed25519.PrivateKey) error {
	_, code, err := keyCommand("secret-tool", []string{
		"store", "--label=Control Rod daemon signing key",
		"service", "controlrod-daemon-signing", "username", "controlrod",
	}, encodeStoredKey(k))
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return errKeychainUnavailable
		}
		return err
	}
	if code != 0 {
		return errKeychainUnavailable
	}
	return nil
}
