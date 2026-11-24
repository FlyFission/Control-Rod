//go:build !linux && !darwin

package runner

import "os"

// fileIdentity has no change-time record on this platform, so large protected files are refused.
func fileIdentity(os.FileInfo) (string, bool) { return "", false }
