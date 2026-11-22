//go:build linux

package artifactstore

import (
	"fmt"
	"io/fs"
	"os"
	"syscall"
)

func renameWithinRoot(root *os.Root, srcDirRel, srcName, dstDirRel, dstName string) error {
	for _, rel := range []string{srcDirRel, dstDirRel} {
		info, err := root.Lstat(rel)
		if err != nil {
			return err
		}
		if info.Mode()&fs.ModeSymlink != 0 {
			return fmt.Errorf("%w: %s", ErrSymlinkRefused, rel)
		}
		if !info.IsDir() {
			return fmt.Errorf("artifactstore: %s is not a directory", rel)
		}
	}
	srcDir, err := root.Open(srcDirRel)
	if err != nil {
		return err
	}
	defer srcDir.Close()

	dstDir, err := root.Open(dstDirRel)
	if err != nil {
		return err
	}
	defer dstDir.Close()

	return syscall.Renameat(int(srcDir.Fd()), srcName, int(dstDir.Fd()), dstName)
}
