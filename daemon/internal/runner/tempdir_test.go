package runner

import (
	"path/filepath"
	"testing"
)

// realTempDir is t.TempDir with its symlinks resolved. On macOS the temporary directory is under
// /var, a link to /private/var, and the daemon compares canonical paths.
func realTempDir(t *testing.T) string {
	t.Helper()
	d, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return d
}
