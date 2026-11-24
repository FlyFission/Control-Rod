//go:build linux

package runner

import (
	"fmt"
	"os"
	"syscall"
)

// fileIdentity names a file by what a process without root cannot set back: device, inode,
// size, modification time and change time. Writing, truncating, replacing or retiming the
// file changes the change time. ok is false when the platform gives no such record.
func fileIdentity(info os.FileInfo) (string, bool) {
	st, ok := info.Sys().(*syscall.Stat_t)
	if !ok || st == nil {
		return "", false
	}
	return fmt.Sprintf("dev=%d ino=%d size=%d mtime=%d.%09d ctime=%d.%09d",
		st.Dev, st.Ino, st.Size, st.Mtim.Sec, st.Mtim.Nsec, st.Ctim.Sec, st.Ctim.Nsec), true
}
