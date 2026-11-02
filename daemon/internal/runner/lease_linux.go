package runner

import (
	"errors"
	"fmt"
	"os"
	"syscall"
)

// guardRuntime takes a read lease on the opened runtime before it is hashed. While the lease holds,
// any open of the file for writing blocks and breaks the lease, which Confirm sees; so the bytes
// hashed are the bytes executed, until the exec itself makes the file unwritable (ETXTBSY). It
// reports whether a lease is held. A file this user cannot write needs none; a file this user can
// write but cannot lease is refused, because nothing would show a change.
func guardRuntime(f *os.File) (bool, error) {
	_, _, errno := syscall.Syscall(syscall.SYS_FCNTL, f.Fd(), syscall.F_SETLEASE, syscall.F_RDLCK)
	switch {
	case errno == 0:
		return true, nil
	case errors.Is(errno, syscall.EAGAIN):
		return false, fmt.Errorf("%s is open for writing by another process (an update in progress?); try again once it finishes", f.Name())
	case errors.Is(errno, syscall.EACCES) && syscall.Access(f.Name(), 2) != nil:
		return false, nil
	default:
		return false, fmt.Errorf("%s cannot be guarded against changes while it starts: %v", f.Name(), errno)
	}
}

// leaseIntact reports whether the read lease still holds: no one opened the file for writing.
func leaseIntact(f *os.File) bool {
	r, _, errno := syscall.Syscall(syscall.SYS_FCNTL, f.Fd(), syscall.F_GETLEASE, 0)
	return errno == 0 && r == syscall.F_RDLCK
}

// releaseLease gives the lease up once the runtime is executing.
func releaseLease(f *os.File) {
	syscall.Syscall(syscall.SYS_FCNTL, f.Fd(), syscall.F_SETLEASE, syscall.F_UNLCK)
}
