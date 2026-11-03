//go:build !linux

package runner

import (
	"os"
	"time"
)

// Outside Linux there are no leases; launch by verified path is the documented limit.
func guardRuntime(*os.File) (bool, error) { return false, nil }
func leaseIntact(*os.File) bool           { return true }
func releaseLease(*os.File)               {}

func leaseBreakTime() time.Duration { return 0 }
