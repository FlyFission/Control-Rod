//go:build !unix

package runner

import "errors"

// checkoutCustodySupported is false here: lockCheckout always fails, so the daemon must not claim
// checkout runs.
func checkoutCustodySupported() bool { return false }

func lockCheckout(string) (func(), error) {
	return nil, errors.New("checkout custody is unavailable on this platform; use a qualified daemon host")
}
