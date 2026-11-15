//go:build darwin

package runner

import (
	"crypto/ed25519"
	"errors"
	"os/exec"
	"strings"
)

func lookupOSKey() (ed25519.PrivateKey, error) {
	out, code, err := keyCommand("security", []string{
		"find-generic-password", "-s", "controlrod-daemon-signing", "-a", "controlrod", "-w",
	}, nil)
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return nil, errKeychainUnavailable
		}
		return nil, err
	}
	if code != 0 {
		if strings.Contains(strings.ToLower(string(out)), "could not be found") {
			return nil, errKeyNotFound
		}
		return nil, errKeychainUnavailable
	}
	return parseStoredKey(out)
}

func storeOSKey(k ed25519.PrivateKey) error {
	// -U updates an existing item. The secret is the argument, which the
	// process list can see for the duration of the command. That is the
	// security(1) interface. This path was not executed on a Mac in this change.
	_, code, err := keyCommand("security", []string{
		"add-generic-password", "-U", "-s", "controlrod-daemon-signing", "-a", "controlrod",
		"-w", string(encodeStoredKey(k)),
	}, nil)
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
