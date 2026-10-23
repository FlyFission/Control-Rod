package confinement

import (
	"context"
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

// validateRoots compares descriptor identities and walks actual parent
// descriptors. It never infers ancestry from names resolved before the open.
func validateRoots(ctx context.Context, input, output *os.Root) error {
	in, err := input.Open(".")
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := output.Open(".")
	if err != nil {
		return err
	}
	defer out.Close()
	inInfo, err := in.Stat()
	if err != nil {
		return err
	}
	outInfo, err := out.Stat()
	if err != nil {
		return err
	}
	if !inInfo.IsDir() || !outInfo.IsDir() || outInfo.Mode().Perm()&0077 != 0 {
		return ErrDenied
	}
	for _, pair := range []struct {
		ancestor   os.FileInfo
		descendant *os.File
	}{{inInfo, out}, {outInfo, in}} {
		overlap, err := containsDirectory(ctx, pair.ancestor, pair.descendant)
		if err != nil {
			return err
		}
		if overlap {
			return ErrDenied
		}
	}
	return ctx.Err()
}

func containsDirectory(ctx context.Context, ancestor os.FileInfo, start *os.File) (bool, error) {
	current := start
	defer func() {
		if current != start {
			_ = current.Close()
		}
	}()
	type identity struct{ dev, ino uint64 }
	seen := map[identity]bool{}
	for {
		if err := ctx.Err(); err != nil {
			return false, err
		}
		info, err := current.Stat()
		if err != nil {
			return false, err
		}
		if os.SameFile(ancestor, info) {
			return true, nil
		}
		stat, ok := info.Sys().(*syscall.Stat_t)
		if !ok {
			return false, ErrDenied
		}
		key := identity{uint64(stat.Dev), uint64(stat.Ino)}
		if seen[key] {
			return false, ErrDenied
		}
		seen[key] = true
		fd, err := syscall.Openat(int(current.Fd()), "..", syscall.O_RDONLY|syscall.O_DIRECTORY|syscall.O_CLOEXEC, 0)
		if err != nil {
			return false, err
		}
		parent := os.NewFile(uintptr(fd), "broker-root-ancestor")
		parentInfo, err := parent.Stat()
		if err != nil {
			_ = parent.Close()
			return false, err
		}
		if os.SameFile(info, parentInfo) {
			_ = parent.Close()
			return false, nil
		}
		if current != start {
			_ = current.Close()
		}
		current = parent
	}
}
