//go:build !unix

package runner

import "os"

// ownedByMe cannot be read on this platform. No runtime that uses it is confined here.
func ownedByMe(os.FileInfo) bool { return false }
