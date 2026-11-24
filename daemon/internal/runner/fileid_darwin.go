//go:build darwin

package runner

import (
	"fmt"
	"os"
	"syscall"
	"time"
)

// fileIdentity names a file by what a process without root cannot set back: device, inode,
// size, modification time and change time. Writing, truncating, replacing or retiming the
// file changes the change time. changed is that change time. ok is false when the platform
// gives no such record.
func fileIdentity(info os.FileInfo) (id string, changed time.Time, ok bool) {
	st, isStat := info.Sys().(*syscall.Stat_t)
	if !isStat || st == nil {
		return "", time.Time{}, false
	}
	changed = time.Unix(int64(st.Ctimespec.Sec), int64(st.Ctimespec.Nsec))
	return fmt.Sprintf("dev=%d ino=%d size=%d mtime=%d.%09d ctime=%d.%09d",
		st.Dev, st.Ino, st.Size, st.Mtimespec.Sec, st.Mtimespec.Nsec, st.Ctimespec.Sec, st.Ctimespec.Nsec), changed, true
}
