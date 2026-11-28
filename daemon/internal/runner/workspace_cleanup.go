package runner

import (
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Run folders this daemon made are removed once their completion is in the outbox, and a
// startup sweep removes the ones a crash left behind (review DMN-9). The completion carries
// the outputs, so nothing reads the folder after that. A checkout is never removed: only a
// folder that Prepare or prepareCheckerIn made (Workspace.ownDir) is.

// rememberWorkspace records the run folder to remove once the completion is in the outbox.
func (d *Daemon) rememberWorkspace(runID string, ws *Workspace) {
	if ws == nil || ws.ownDir == "" || ws.Checkout != nil || ws.RunRoot != "" {
		return
	}
	d.workspaces.Store(runID, ws.ownDir)
}

// removeWorkspace removes the run folder recorded for runID, if any.
func (d *Daemon) removeWorkspace(runID string) {
	v, ok := d.workspaces.LoadAndDelete(runID)
	if !ok {
		return
	}
	dir := v.(string)
	if err := removeRunDir(dir); err != nil {
		d.log.Warn("run folder could not be removed; the next start removes it", "run", runID, "path", dir, "err", err)
	}
}

// forgetWorkspace drops the record without removing the folder.
func (d *Daemon) forgetWorkspace(runID string) { d.workspaces.Delete(runID) }

// removeRunDir removes a run folder whose processes are gone. An agent may have left a folder
// it cannot be removed from (mode 0500) or, on macOS, a locked file; both are undone first.
// Links are removed, never followed.
func removeRunDir(dir string) error {
	st, err := os.Lstat(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if st.IsDir() {
		_ = setImmutable(dir, false)
		_ = filepath.WalkDir(dir, func(p string, e fs.DirEntry, err error) error {
			if err == nil && e.IsDir() {
				_ = os.Chmod(p, 0o700)
			}
			return nil
		})
	}
	return os.RemoveAll(dir)
}

// staleWorkspaceAge is how old a run folder under the daemon home must be before the startup
// sweep removes it. It is far longer than any run, so a `controlrod check` that shares the
// home and is starting now is never touched.
func staleWorkspaceAge(timeout time.Duration) time.Duration {
	return max(24*time.Hour, 2*timeout)
}

// sweepStaleWorkspaces removes run folders under <home>/work that a crash left behind: older
// than staleWorkspaceAge, and not of a run whose receipt is still kept (its processes may not
// be gone). Only the fixed layout work/<package>/r<revision>/<leaf> is touched; anything else,
// and every link, is left alone. Empty package and revision folders are removed after.
func (d *Daemon) sweepStaleWorkspaces(now time.Time) {
	work := filepath.Join(d.cfg.Home, "work")
	if st, err := os.Lstat(work); err != nil || !st.IsDir() {
		return
	}
	held := map[string]bool{}
	if list, err := d.receipts.List(); err == nil {
		for _, r := range list {
			held[r.RunID] = true
		}
	} else {
		d.log.Warn("run folders not swept: receipts cannot be read", "err", err)
		return
	}
	cutoff := now.Add(-staleWorkspaceAge(d.cfg.Timeout))
	removed := 0
	for _, pkg := range realDirs(work) {
		for _, rev := range realDirs(pkg) {
			if !strings.HasPrefix(filepath.Base(rev), "r") {
				continue
			}
			for _, leaf := range realDirs(rev) {
				if leafHeld(filepath.Base(leaf), held) || d.leafActive(filepath.Base(leaf)) {
					continue
				}
				st, err := os.Lstat(leaf)
				if err != nil || !st.ModTime().Before(cutoff) {
					continue
				}
				if err := removeRunDir(leaf); err != nil {
					d.log.Warn("stale run folder could not be removed", "path", leaf, "err", err)
					continue
				}
				removed++
			}
			_ = os.Remove(rev) // only when empty
		}
		_ = os.Remove(pkg) // only when empty
	}
	if removed > 0 {
		d.log.Info("removed run folders left by earlier runs", "count", removed)
	}
}

// realDirs lists the real directories (not links) directly in dir.
func realDirs(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []string
	for _, e := range entries {
		if e.Type().IsDir() {
			out = append(out, filepath.Join(dir, e.Name()))
		}
	}
	return out
}

// leafHeld reports whether a leaf <role>-<round>-<run> belongs to a run in held.
func leafHeld(leaf string, held map[string]bool) bool {
	for id := range held {
		if strings.HasSuffix(leaf, "-"+id) {
			return true
		}
	}
	return false
}

// leafActive reports whether a leaf belongs to a run this daemon is running now.
func (d *Daemon) leafActive(leaf string) bool {
	d.activeMu.Lock()
	defer d.activeMu.Unlock()
	for id, on := range d.active {
		if on && strings.HasSuffix(leaf, "-"+id) {
			return true
		}
	}
	return false
}
