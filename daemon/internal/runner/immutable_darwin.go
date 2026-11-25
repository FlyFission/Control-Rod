//go:build darwin

package runner

import (
	"io/fs"
	"path/filepath"
	"syscall"
)

// ufImmutable is UF_IMMUTABLE (chflags uchg): even the owner cannot change, rename or delete the
// file, or change its mode, until the flag is cleared.
const ufImmutable = 0x2

// setImmutable sets or clears the user immutable flag on every file and folder under root,
// without following symlinks.
func setImmutable(root string, on bool) error {
	return filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.Type()&fs.ModeSymlink != 0 {
			return nil
		}
		var st syscall.Stat_t
		if err := syscall.Lstat(p, &st); err != nil {
			return err
		}
		flags := int(st.Flags)
		if on {
			flags |= ufImmutable
		} else {
			flags &^= ufImmutable
		}
		return syscall.Chflags(p, flags)
	})
}
