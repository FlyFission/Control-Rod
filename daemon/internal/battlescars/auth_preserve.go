package battlescars

import (
	"context"
	"errors"
	"os"
	"syscall"
)

// ResolveAuthStateOnError determines the effective authentication state after a
// credential or session probe.
//
//   - If probeErr == nil, the probe completed authoritatively: effectiveAuth is
//     probeAuth and preserved is false (so probeAuth == false explicitly clears
//     authentication).
//   - If probeErr != nil and is classified as a transient storage, keychain,
//     permission-lock, timeout, or I/O failure (os.ErrDeadlineExceeded,
//     context.DeadlineExceeded, context.Canceled, syscall.EIO, syscall.EACCES,
//     syscall.EBUSY, syscall.EAGAIN, syscall.EINTR, syscall.ETIMEDOUT), it
//     preserves prevKnownGood (returning effectiveAuth=prevKnownGood,
//     preserved=prevKnownGood) rather than spontaneously signing the user out.
//   - If probeErr != nil and is a non-transient error, it fails closed
//     (returning effectiveAuth=false, preserved=false).
func ResolveAuthStateOnError(prevKnownGood bool, probeAuth bool, probeErr error) (effectiveAuth bool, preserved bool) {
	if probeErr == nil {
		return probeAuth, false
	}
	if IsTransientAuthProbeError(probeErr) {
		if prevKnownGood {
			return true, true
		}
		return false, false
	}
	return false, false
}

// IsTransientAuthProbeError reports whether err represents a transient
// storage, keychain, lock contention, or timeout failure during credential
// probing.
func IsTransientAuthProbeError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, os.ErrDeadlineExceeded) ||
		errors.Is(err, context.DeadlineExceeded) ||
		errors.Is(err, context.Canceled) ||
		errors.Is(err, syscall.EIO) ||
		errors.Is(err, syscall.EACCES) ||
		errors.Is(err, syscall.EBUSY) ||
		errors.Is(err, syscall.EAGAIN) ||
		errors.Is(err, syscall.EINTR) ||
		errors.Is(err, syscall.ETIMEDOUT) {
		return true
	}

	var netErr interface{ Timeout() bool }
	if errors.As(err, &netErr) && netErr.Timeout() {
		return true
	}
	return false
}
