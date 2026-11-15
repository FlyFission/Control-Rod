//go:build !linux && !darwin

package runner

import "crypto/ed25519"

func lookupOSKey() (ed25519.PrivateKey, error) {
	return nil, errKeychainUnavailable
}

func storeOSKey(ed25519.PrivateKey) error {
	return errKeychainUnavailable
}
