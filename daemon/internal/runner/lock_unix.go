//go:build unix

package runner

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

// LockHome takes the home's daemon lock, so only one daemon at a time owns its receipts and its
// run scopes. The lock is released when the returned function runs or the process exits.
//
// The holder writes its PID into daemon.lock after it wins the lock, and a second daemon mentions
// that PID when it refuses to start, as an unverified hint only: it may be stale or reused, so the
// refusal asks the operator to check the process list rather than naming a process to stop. The file is
// opened without O_TRUNC, so a daemon that loses never erases the holder's PID. A filesystem that
// cannot lock fails closed: two daemons on one home would share receipts.
//
// daemon.lock must be a regular file in the home itself: it is opened with O_NOFOLLOW, so the PID
// write can never truncate a file a symlink points at. A clean release empties it again, so a
// recorded PID belongs to a live holder or to one that crashed, and a PID whose process no longer
// exists is never named.
func LockHome(home string) (func(), error) {
	if err := os.MkdirAll(home, 0o700); err != nil {
		return nil, err
	}
	path := filepath.Join(home, "daemon.lock")
	// O_NONBLOCK: if the path is a FIFO or a device, opening it must not wait; it is refused below.
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0o600)
	if err != nil {
		if errors.Is(err, syscall.ELOOP) {
			return nil, fmt.Errorf("%s is a symbolic link; Control Rod will not start until it is a plain file in the home (remove the link)", path)
		}
		return nil, err
	}
	// One name only: a hard link would let the PID write change another file.
	if fi, serr := f.Stat(); serr != nil || !fi.Mode().IsRegular() || hardLinked(fi) {
		// Read a PID only from a regular file: reading a FIFO or a device could block or have effects.
		pid := 0
		if serr == nil && fi.Mode().IsRegular() {
			pid = readHolderPID(f)
		}
		f.Close()
		// Removing a lock file another daemon still holds would let a second daemon lock a new file
		// at the same path: check first that no daemon uses this home.
		return nil, fmt.Errorf("%s is not a plain file with a single name; Control Rod will not start until it is. %s, then remove %s", path, checkNoDaemon(home, pid), path)
	}
	if err := flockHome(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		// A new holder writes its PID right after it wins the lock; give it that moment, so a crashed
		// holder's PID left in the file is rarely read in its place.
		time.Sleep(holderWriteWait)
		holder := readHolderPID(f)
		if holder > 0 && !processExists(holder) {
			holder = 0
		}
		f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return nil, fmt.Errorf("a Control Rod daemon may already be running with home %s: another process holds its lock. %s before starting another", home, checkNoDaemon(home, holder))
		}
		return nil, fmt.Errorf("cannot lock the daemon home %s, so Control Rod will not start (two daemons would share its receipts): %w", home, err)
	}
	if err := writeHolderPID(f, os.Getpid()); err != nil {
		_ = flockHome(int(f.Fd()), syscall.LOCK_UN)
		f.Close()
		return nil, fmt.Errorf("record the daemon PID in %s: %w", f.Name(), err)
	}
	return func() {
		// Empty the file while still holding the lock, so the next contender never names this PID.
		_ = f.Truncate(0)
		_ = flockHome(int(f.Fd()), syscall.LOCK_UN)
		f.Close()
	}, nil
}

// checkNoDaemon tells the operator how to find the daemon using home. A PID read from daemon.lock
// is only a lead: it may be stale or reused by an unrelated process, so it is never presented as
// the daemon.
func checkNoDaemon(home string, pid int) string {
	s := fmt.Sprintf("Check the process list for a Control Rod daemon using home %s and stop it", home)
	if pid > 0 && processExists(pid) {
		s += fmt.Sprintf(" (daemon.lock names pid %d, which may be that daemon or an unrelated process that reused the number)", pid)
	}
	return s
}

// holderWriteWait is how long a refused contender waits before it reads the holder's PID.
const holderWriteWait = 50 * time.Millisecond

// flockHome is syscall.Flock; tests replace it to reach the unsupported-filesystem path.
var flockHome = syscall.Flock

// writeHolderPID replaces the file's content with pid. It runs only while the lock is held.
func writeHolderPID(f *os.File, pid int) error {
	if err := f.Truncate(0); err != nil {
		return err
	}
	_, err := f.WriteAt([]byte(strconv.Itoa(pid)+"\n"), 0)
	return err
}

// readHolderPID returns the PID recorded by the lock's holder, or 0 when none is readable.
func readHolderPID(f *os.File) int {
	var buf [32]byte
	n, err := f.ReadAt(buf[:], 0)
	if err != nil && !errors.Is(err, io.EOF) {
		return 0
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(buf[:n])))
	if err != nil || pid <= 0 {
		return 0
	}
	return pid
}

// lockFile takes an exclusive lock on path, waiting for any other holder, and returns its release.
func lockFile(path string) (func(), error) {
	f, err := os.OpenFile(path, os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, err
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}

// hardLinked reports whether the file has more than one name.
func hardLinked(fi os.FileInfo) bool {
	st, ok := fi.Sys().(*syscall.Stat_t)
	return ok && st.Nlink > 1
}
