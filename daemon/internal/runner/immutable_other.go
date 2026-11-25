//go:build !darwin

package runner

// setImmutable is used only for Antigravity checkers, which run only on macOS.
func setImmutable(string, bool) error { return nil }
