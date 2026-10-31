//go:build linux

package runner

import (
	"syscall"
	"unsafe"
)

// waitExitNoReap blocks until a child exits without reaping it (waitid with WNOWAIT). The child
// stays a zombie, so its process id and its process group number cannot be reused until the
// daemon reaps it: signals to the group stay aimed at the run.
func waitExitNoReap(pid int) error {
	const pPID, wExited, wNoWait = 1, 0x4, 0x1000000
	var info [128]byte
	for {
		_, _, e := syscall.Syscall6(syscall.SYS_WAITID, pPID, uintptr(pid), uintptr(unsafe.Pointer(&info[0])), wExited|wNoWait, 0, 0)
		if e == syscall.EINTR {
			continue
		}
		if e != 0 {
			return e
		}
		return nil
	}
}

const canWaitNoReap = true
