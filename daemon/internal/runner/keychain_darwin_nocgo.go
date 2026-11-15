//go:build darwin && !cgo

package runner

import "crypto/ed25519"

// Without cgo the Security framework is not linked. The private key is not
// passed to a helper's arguments, and a counted check is not signed.
func lookupOSKey() (ed25519.PrivateKey, error) {
	return nil, errKeychainUnavailable
}

func storeOSKey(ed25519.PrivateKey) error {
	return errKeychainUnavailable
}
