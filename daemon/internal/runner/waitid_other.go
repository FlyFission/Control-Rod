//go:build !linux

package runner

import "errors"

// waitExitNoReap is Linux only here; elsewhere the leader is reaped when it exits.
func waitExitNoReap(int) error {
	return errors.New("waitid without reaping is not used on this platform")
}

const canWaitNoReap = false
