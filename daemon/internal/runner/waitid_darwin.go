//go:build darwin

package runner

import "syscall"

// waitExitNoReap blocks until a child exits without reaping it, through a kqueue NOTE_EXIT event
// (macOS has no waitid WNOWAIT that Go can call). The child stays a zombie, so its process id and
// its process group number cannot be reused until the daemon reaps it: signals to the group stay
// aimed at the run, as on Linux.
func waitExitNoReap(pid int) error {
	kq, err := syscall.Kqueue()
	if err != nil {
		return err
	}
	defer syscall.Close(kq)
	change := []syscall.Kevent_t{{
		Ident:  uint64(pid),
		Filter: syscall.EVFILT_PROC,
		Flags:  syscall.EV_ADD | syscall.EV_ONESHOT,
		Fflags: syscall.NOTE_EXIT,
	}}
	out := make([]syscall.Kevent_t, 1)
	for {
		n, err := syscall.Kevent(kq, change, out, nil)
		if err == syscall.EINTR {
			continue
		}
		// The child is this daemon's and unreaped, so it exists: ESRCH means it has already exited.
		if err == syscall.ESRCH {
			return nil
		}
		if err != nil {
			return err
		}
		if n == 1 && out[0].Flags&syscall.EV_ERROR != 0 {
			if e := syscall.Errno(out[0].Data); e != 0 && e != syscall.ESRCH {
				return e
			}
			return nil
		}
		if n == 1 && out[0].Fflags&syscall.NOTE_EXIT != 0 {
			return nil
		}
		change = nil
	}
}

const canWaitNoReap = true
