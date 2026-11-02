package runner

import (
	"os"
	"path/filepath"
	"testing"
)

func TestUnreadableCgroupStateCountsAsAlive(t *testing.T) {
	dir := t.TempDir()
	if populated(filepath.Join(dir, "gone")) {
		t.Fatal("a cgroup that no longer exists is empty")
	}
	ev := filepath.Join(dir, "cgroup.events")
	if err := os.WriteFile(ev, []byte("populated 0\nfrozen 0\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if populated(dir) {
		t.Fatal("populated 0 is empty")
	}
	if err := os.WriteFile(ev, []byte("frozen 0\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !populated(dir) {
		t.Fatal("an answer without the populated field is not proof of empty")
	}
	if os.Getuid() != 0 {
		if err := os.Chmod(ev, 0); err != nil {
			t.Fatal(err)
		}
		if !populated(dir) {
			t.Fatal("an unreadable cgroup counts as populated")
		}
	}
}
