package runner

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func makeLeaf(t *testing.T, path string, age time.Duration) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(path, "out"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, "out", "x"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-age)
	if err := os.Chtimes(path, old, old); err != nil {
		t.Fatal(err)
	}
}

func exists(path string) bool {
	_, err := os.Lstat(path)
	return err == nil
}

// The startup sweep removes run folders a crash left behind, and nothing else: not a recent
// folder, not one whose run still holds a receipt, not a link and not what a link points to
// (review DMN-9).
func TestStartupSweepRemovesOnlyStaleRunFolders(t *testing.T) {
	d := quietDaemon(t)
	home := d.cfg.Home
	rev := filepath.Join(home, "work", "WP-1", "r2")
	stale := filepath.Join(rev, "author-1-run-old")
	recent := filepath.Join(rev, "author-2-run-new")
	held := filepath.Join(rev, "pre-check-1-run-held")
	makeLeaf(t, stale, 48*time.Hour)
	makeLeaf(t, recent, time.Minute)
	makeLeaf(t, held, 48*time.Hour)
	if err := d.receipts.Put(SpawnReceipt{RunID: "run-held", PID: 1, PGID: 1}); err != nil {
		t.Fatal(err)
	}
	// A folder the agent left that the daemon cannot write into.
	locked := filepath.Join(stale, "out", "locked")
	if err := os.MkdirAll(locked, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(locked, "f"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(locked, 0o500); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-48 * time.Hour)
	_ = os.Chtimes(stale, old, old)
	// A link where a run folder would be, to a folder outside the home.
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "keep"), []byte("k"), 0o600); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(rev, "author-3-run-link")
	if err := os.Symlink(outside, link); err != nil {
		t.Fatal(err)
	}
	// A whole package whose only folder is stale is pruned.
	lone := filepath.Join(home, "work", "WP-2", "r1", "author-1-run-lone")
	makeLeaf(t, lone, 48*time.Hour)

	d.sweepStaleWorkspaces(time.Now())

	if exists(stale) {
		t.Error("a stale run folder was kept")
	}
	if exists(filepath.Join(home, "work", "WP-2")) {
		t.Error("an empty package folder was kept")
	}
	for _, p := range []string{recent, held, link, filepath.Join(outside, "keep")} {
		if !exists(p) {
			t.Errorf("%s was removed", p)
		}
	}
}

func TestStartupSweepSkipsARunThisDaemonIsRunning(t *testing.T) {
	d := quietDaemon(t)
	leaf := filepath.Join(d.cfg.Home, "work", "WP-1", "r2", "author-1-run-live")
	makeLeaf(t, leaf, 48*time.Hour)
	d.setActive("run-live", "unit", true)
	d.sweepStaleWorkspaces(time.Now())
	if !exists(leaf) {
		t.Fatal("the folder of a running run was removed")
	}
}

// A checkout is the user's own folder: it is never recorded for removal, and neither is a
// runtime's own run root, which the daemon removes itself.
func TestOnlyTheDaemonsOwnRunFolderIsRemoved(t *testing.T) {
	d := quietDaemon(t)
	own := filepath.Join(t.TempDir(), "author-1-run-a")
	makeLeaf(t, own, 0)
	user := t.TempDir()
	d.rememberWorkspace("run-a", &Workspace{Dir: own, ownDir: own})
	d.rememberWorkspace("run-b", &Workspace{Dir: user, ownDir: user, Checkout: &CheckoutBinding{Path: user}})
	d.rememberWorkspace("run-c", &Workspace{Dir: user})
	d.rememberWorkspace("run-d", &Workspace{Dir: user, ownDir: user, RunRoot: user})
	for _, id := range []string{"run-a", "run-b", "run-c", "run-d"} {
		d.removeWorkspace(id)
	}
	if exists(own) {
		t.Error("the daemon's own run folder was kept")
	}
	if !exists(user) {
		t.Fatal("a folder that is not the daemon's own was removed")
	}
}

func TestPrepareMarksOnlyItsOwnFolder(t *testing.T) {
	root := t.TempDir()
	ws, err := Prepare(root, &Job{Run: testRun("run-own", "author")})
	if err != nil {
		t.Fatal(err)
	}
	if ws.ownDir != ws.Dir {
		t.Fatalf("ownDir %q, Dir %q", ws.ownDir, ws.Dir)
	}
	b := checkoutFixture(t)
	r := testRun("run-co", "author")
	r.Checkout = b
	cws, err := Prepare(t.TempDir(), &Job{Run: r})
	if err != nil {
		t.Fatal(err)
	}
	defer cws.releaseCheckout()
	if cws.ownDir != "" {
		t.Fatalf("a checkout run marked %q for removal", cws.ownDir)
	}
}
