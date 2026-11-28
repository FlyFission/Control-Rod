//go:build unix

package runner

import (
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func TestEnsurePrivateDirMakesAPrivateFolder(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "root")
	if err := ensurePrivateDir(dir); err != nil {
		t.Fatal(err)
	}
	st, err := os.Lstat(dir)
	if err != nil || !st.IsDir() || st.Mode().Perm() != 0o700 {
		t.Fatalf("got %v %v", st, err)
	}
	// A second call accepts the folder it made.
	if err := ensurePrivateDir(dir); err != nil {
		t.Fatal(err)
	}
}

// A folder in /var/tmp can be made first by another user, or be a link. Each is refused
// (review DMN-2).
func TestEnsurePrivateDirRefusesAFolderSomeoneElseCouldReach(t *testing.T) {
	t.Run("link", func(t *testing.T) {
		base := t.TempDir()
		elsewhere := filepath.Join(base, "elsewhere")
		if err := os.Mkdir(elsewhere, 0o700); err != nil {
			t.Fatal(err)
		}
		dir := filepath.Join(base, "root")
		if err := os.Symlink(elsewhere, dir); err != nil {
			t.Fatal(err)
		}
		if err := ensurePrivateDir(dir); err == nil || !strings.Contains(err.Error(), "link") {
			t.Fatalf("got %v", err)
		}
	})
	t.Run("file", func(t *testing.T) {
		dir := filepath.Join(t.TempDir(), "root")
		if err := os.WriteFile(dir, nil, 0o600); err != nil {
			t.Fatal(err)
		}
		if err := ensurePrivateDir(dir); err == nil {
			t.Fatal("a file was accepted as the folder")
		}
	})
	t.Run("open mode", func(t *testing.T) {
		for _, mode := range []os.FileMode{0o755, 0o777, 0o1777, 0o750, 0o500} {
			dir := filepath.Join(t.TempDir(), "root")
			if err := os.Mkdir(dir, 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.Chmod(dir, mode); err != nil {
				t.Fatal(err)
			}
			if err := ensurePrivateDir(dir); err == nil || !strings.Contains(err.Error(), "0700") {
				t.Fatalf("mode %o: got %v", mode, err)
			}
		}
	})
	t.Run("other owner", func(t *testing.T) {
		if os.Getuid() != 0 {
			t.Skip("only root can give a folder to another user")
		}
		dir := filepath.Join(t.TempDir(), "root")
		if err := os.Mkdir(dir, 0o700); err != nil {
			t.Fatal(err)
		}
		if err := os.Chown(dir, 54321, 54321); err != nil {
			t.Fatal(err)
		}
		if err := ensurePrivateDir(dir); err == nil || !strings.Contains(err.Error(), "another user") {
			t.Fatalf("got %v", err)
		}
	})
}

func TestCheckerRootRefusesAPlantedFolder(t *testing.T) {
	old := checkerTmp
	checkerTmp = t.TempDir()
	t.Cleanup(func() { checkerTmp = old })
	planted := filepath.Join(checkerTmp, "planted")
	if err := os.Mkdir(planted, 0o777); err != nil {
		t.Fatal(err)
	}
	name := filepath.Join(checkerTmp, "controlrod-checker-"+strconv.Itoa(os.Getuid()))
	if err := os.Symlink(planted, name); err != nil {
		t.Fatal(err)
	}
	if _, err := checkerRoot(""); err == nil {
		t.Fatal("a checker root that is a link was used")
	}
	if err := os.Remove(name); err != nil {
		t.Fatal(err)
	}
	got, err := checkerRoot("")
	if err != nil {
		t.Fatal(err)
	}
	if st, err := os.Lstat(got); err != nil || st.Mode().Perm() != 0o700 {
		t.Fatalf("checker root %s: %v %v", got, st, err)
	}
}
