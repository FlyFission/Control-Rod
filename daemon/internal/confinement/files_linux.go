package confinement

import (
	"os"
	"syscall"
)

// Nonblocking open prevents a replaced source from hanging on a FIFO. Validate
// the actual opened descriptor, not a path checked before the open.
func openRegular(root *os.Root, path string) (*os.File, error) {
	f, err := root.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK, 0)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		_ = f.Close()
		if err == nil {
			err = ErrDenied
		}
		return nil, err
	}
	return f, nil
}
