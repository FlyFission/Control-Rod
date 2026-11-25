//go:build !linux && !darwin

package runner

import (
	"os"
	"time"
)

// fileIdentity has no change-time record on this platform, so large protected files are refused.
func fileIdentity(os.FileInfo) (string, time.Time, bool) { return "", time.Time{}, false }

// ownChangeTime is false where no change-time record is read.
func ownChangeTime(string) bool { return false }
