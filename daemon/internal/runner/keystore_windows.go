//go:build windows

package runner

import "os"

// fileOwnedByUser has no uid on Windows. The test-only file key still requires
// mode 0600, and it is never read unless CONTROLROD_ALLOW_FAKE=1.
func fileOwnedByUser(os.FileInfo) bool { return true }
