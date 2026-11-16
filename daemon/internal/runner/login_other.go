//go:build !linux && !darwin

package runner

import "os"

func ownedByCaller(os.FileInfo) bool { return false }
