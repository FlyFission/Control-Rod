//go:build !unix

package runner

import "errors"

func lockCheckout(string) (func(), error) {
	return nil, errors.New("checkout custody is unavailable on this platform; use a qualified daemon host")
}
