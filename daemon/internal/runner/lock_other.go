//go:build !unix

package runner

import (
	"context"
	"errors"
	"os"
	"time"
)

// LockHome is a no-op here; the Windows daemon arrives in Phase 6.
func LockHome(string) (func(), error) { return func() {}, nil }

// LockHomeWithWait fails closed on platforms where flock is not yet wired.
func LockHomeWithWait(context.Context, string, time.Duration) (*os.File, error) {
	return nil, errors.ErrUnsupported
}

// lockFile is a no-op here; runtimes are staged only on Linux and macOS.
func lockFile(string) (func(), error) { return func() {}, nil }
