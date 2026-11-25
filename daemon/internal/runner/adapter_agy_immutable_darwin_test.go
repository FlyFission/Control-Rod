//go:build darwin

package runner

import (
	"os"
	"path/filepath"
	"testing"
)

// An Antigravity checker's inputs cannot be changed by anything the run starts, not even for a
// moment: they are immutable from launch until the run folder is removed.
func TestAgyCheckerInputsAreImmutableUntilTheRunFolderGoes(t *testing.T) {
	job := &Job{Run: testRun("c1", "pre-check")}
	job.Inputs = []NamedFile{{Name: "deliverables/a.txt", ContentBase64: "b3JpZ2luYWw="}}
	ws, err := prepareWorkspace(t.TempDir(), job, agyAdapter{})
	if err != nil {
		t.Fatal(err)
	}
	root := ws.RunRoot
	t.Cleanup(func() { removeRunRoot(root) })
	if _, err := Command(RuntimeAgy, testRun("c1", "pre-check"), ws, testPolicy(), testPaths(ws)); err != nil {
		t.Fatal(err)
	}
	var target string
	_ = filepath.WalkDir(ws.Inputs, func(p string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && target == "" {
			target = p
		}
		return nil
	})
	if target == "" {
		t.Fatal("no input file to test")
	}
	if f, err := os.OpenFile(target, os.O_WRONLY|os.O_TRUNC, 0); err == nil {
		f.Close()
		t.Fatal("an input could be rewritten")
	}
	if err := os.Chmod(target, 0o600); err == nil {
		t.Fatal("an input's mode could be changed")
	}
	if err := os.Rename(target, target+".x"); err == nil {
		t.Fatal("an input could be moved")
	}
	if err := os.WriteFile(filepath.Join(filepath.Dir(target), "new.txt"), nil, 0o600); err == nil {
		t.Fatal("a file could be added beside the inputs")
	}
	if err := os.WriteFile(filepath.Join(ws.Scratch, "verification.json"), []byte("{}"), 0o600); err != nil {
		t.Fatalf("scratch is not writable: %v", err)
	}
	removeRunRoot(root)
	if _, err := os.Lstat(root); !os.IsNotExist(err) {
		t.Fatalf("the run folder was not removed: %v", err)
	}
}
