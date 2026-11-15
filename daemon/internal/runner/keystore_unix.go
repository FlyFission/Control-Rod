//go:build unix

package runner

import (
	"os"
	"syscall"
)

func fileOwnedByUser(fi os.FileInfo) bool {
	st, ok := fi.Sys().(*syscall.Stat_t)
	if !ok {
		return false
	}
	return st.Uid == uint32(os.Getuid())
}
