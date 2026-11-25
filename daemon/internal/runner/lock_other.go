//go:build !unix

package runner

import (
	"context"
	"errors"
)

// LockHome is a no-op here; the Windows daemon arrives in Phase 6.
func LockHome(string) (func(), error) { return func() {}, nil }

// lockFile is a no-op here; runtimes are staged only on Linux and macOS.
func lockFile(string) (func(), error) { return func() {}, nil }

// lockFileWait is not available here; the only runtime that needs it runs on macOS.
func lockFileWait(context.Context, string) (func(), error) {
	return nil, errors.New("run locks are not supported on this platform")
}
