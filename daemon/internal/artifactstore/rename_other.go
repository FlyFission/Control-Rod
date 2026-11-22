//go:build !linux

package artifactstore

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
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
	base := root.Name()
	return os.Rename(filepath.Join(base, srcDirRel, srcName), filepath.Join(base, dstDirRel, dstName))
}
