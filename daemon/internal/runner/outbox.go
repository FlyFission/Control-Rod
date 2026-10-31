package runner

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// OutboxEntry is one completion waiting for the control plane to confirm it.
type OutboxEntry struct {
	RunID      string     `json:"run_id"`
	Completion Completion `json:"completion"`
}

// Outbox keeps completions on disk until the control plane confirms them, so a finished run is
// not lost when the network or the control plane is down at the wrong moment. Files live in
// <home>/outbox, readable by the owner only. Refused completions move to outbox/refused/.
type Outbox struct {
	dir  string
	mu   sync.Mutex
	busy map[string]bool
}

// NewOutbox returns the outbox under home.
func NewOutbox(home string) *Outbox {
	return &Outbox{dir: filepath.Join(home, "outbox"), busy: map[string]bool{}}
}

func (o *Outbox) path(runID string) (string, error) {
	if !safeSegment.MatchString(runID) {
		return "", fmt.Errorf("%w: %q", ErrUnsafePath, runID)
	}
	return filepath.Join(o.dir, runID+".json"), nil
}

// Put writes the entry atomically.
func (o *Outbox) Put(e OutboxEntry) error {
	p, err := o.path(e.RunID)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(o.dir, 0o700); err != nil {
		return err
	}
	b, err := json.Marshal(e)
	if err != nil {
		return err
	}
	tmp := p + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return err
	}
	// Synced before the rename and the directory after it: the spawn receipt is removed once this
	// returns, so the completion must survive a crash.
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp, p); err != nil {
		return err
	}
	return syncDir(o.dir)
}

// Has reports whether a completion for the run is waiting in the outbox.
func (o *Outbox) Has(runID string) bool {
	p, err := o.path(runID)
	if err != nil {
		return false
	}
	_, err = os.Stat(p)
	return err == nil
}

// Remove deletes a confirmed entry.
func (o *Outbox) Remove(runID string) {
	if p, err := o.path(runID); err == nil {
		_ = os.Remove(p)
	}
}

// Refused moves an entry the control plane refused for good into outbox/refused/, kept as evidence.
func (o *Outbox) Refused(runID string) {
	p, err := o.path(runID)
	if err != nil {
		return
	}
	dir := filepath.Join(o.dir, "refused")
	if os.MkdirAll(dir, 0o700) == nil {
		_ = os.Rename(p, filepath.Join(dir, filepath.Base(p)))
	}
}

// List returns every pending entry in run id order. Unreadable files are skipped and reported.
func (o *Outbox) List() ([]OutboxEntry, error) {
	names, err := os.ReadDir(o.dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []OutboxEntry
	var bad []string
	for _, n := range names {
		if n.IsDir() || !strings.HasSuffix(n.Name(), ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(o.dir, n.Name()))
		var e OutboxEntry
		if err != nil || json.Unmarshal(b, &e) != nil || e.RunID+".json" != n.Name() {
			bad = append(bad, n.Name())
			continue
		}
		out = append(out, e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].RunID < out[j].RunID })
	if len(bad) > 0 {
		return out, fmt.Errorf("unreadable outbox entries: %s", strings.Join(bad, ", "))
	}
	return out, nil
}

// take marks a run as being delivered; false if another goroutine already is.
func (o *Outbox) take(runID string) bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.busy[runID] {
		return false
	}
	o.busy[runID] = true
	return true
}

func (o *Outbox) release(runID string) {
	o.mu.Lock()
	defer o.mu.Unlock()
	delete(o.busy, runID)
}
