//go:build linux || darwin

package runner

import (
	"os"
	"syscall"
)

func ownedByCaller(info os.FileInfo) bool {
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok || st == nil {
		return false
	}
	return st.Uid == uint32(os.Getuid())
}
