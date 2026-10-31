//go:build !unix

package runner

// LockHome is a no-op here; the Windows daemon arrives in Phase 6.
func LockHome(string) (func(), error) { return func() {}, nil }
