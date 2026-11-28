package runner

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
)

// ensurePrivateDir makes dir (mode 0700) when it is missing, then checks that what is there is a
// private folder of this user: a real directory, not a link, owned by this user, mode exactly
// 0700. A folder in a shared place such as /var/tmp can be made first by another user, or be
// a link to somewhere else; using it would let that user read or change what the daemon
// writes there (review DMN-2). The parent must already exist.
func ensurePrivateDir(dir string) error {
	if err := os.Mkdir(dir, 0o700); err != nil && !errors.Is(err, fs.ErrExist) {
		return err
	}
	st, err := os.Lstat(dir)
	if err != nil {
		return err
	}
	switch {
	case st.Mode()&fs.ModeSymlink != 0:
		return fmt.Errorf("%s is a link, not a private folder of this user; remove it and try again", dir)
	case !st.IsDir():
		return fmt.Errorf("%s is not a folder; remove it and try again", dir)
	case !ownedByMe(st):
		return fmt.Errorf("%s belongs to another user, so it is not used; remove it and try again", dir)
	case st.Mode().Perm() != 0o700:
		return fmt.Errorf("%s has mode %04o, and it must be 0700 (chmod 700 %s)", dir, st.Mode().Perm(), dir)
	}
	return nil
}
