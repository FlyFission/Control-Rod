//go:build !unix

package runner

// LockHome is a no-op here; the Windows daemon arrives in Phase 6.
func LockHome(string) (func(), error) { return func() {}, nil }

// lockFile is a no-op here; runtimes are staged only on Linux and macOS.
func lockFile(string) (func(), error) { return func() {}, nil }
