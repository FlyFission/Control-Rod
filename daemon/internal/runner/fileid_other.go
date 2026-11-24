//go:build !linux && !darwin

package runner

import (
	"os"
	"time"
)

// fileIdentity has no change-time record on this platform, so large protected files are refused.
func fileIdentity(os.FileInfo) (string, time.Time, bool) { return "", time.Time{}, false }
