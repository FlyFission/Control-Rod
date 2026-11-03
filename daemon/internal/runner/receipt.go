package runner

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// SpawnReceipt is the spawn-time proof of which process a daemon started for a run (specification 22;
// the pattern is agent-deck's process ownership record, see docs/patterns/workbench-donors.md).
// A stop, an orphan sweep or a kill acts only on the run's own containment unit (see contain.go):
// its cgroup scope, or in the fallback its process group while the leader still matches (same
// boot, same process id, same start time). A reused process id never matches.
type SpawnReceipt struct {
	RunID        string `json:"run_id"`
	ClaimToken   string `json:"claim_token"`
	PID          int    `json:"pid"`
	PGID         int    `json:"pgid"`
	ProcessStart string `json:"process_start"`
	BootID       string `json:"boot_id"`
	Generation   int    `json:"generation"`
	StartedAt    string `json:"started_at"`
	// Containment is ContainCgroup or ContainGroup; Unit names the scope and Cgroup is its directory.
	Containment string `json:"containment"`
	Unit        string `json:"unit,omitempty"`
	Cgroup      string `json:"cgroup,omitempty"`

	// pinned is set while this daemon holds the leader unreaped (exited or not): its process group
	// number cannot be reused, so the fallback may signal the group. Never stored.
	pinned bool
}

// Wire is the receipt as the control plane records it: no token, no local paths.
func (r SpawnReceipt) Wire() OwnershipReceipt {
	return OwnershipReceipt{PID: r.PID, PGID: r.PGID, ProcessStart: r.ProcessStart, BootID: r.BootID, Generation: r.Generation, StartedAt: r.StartedAt,
		Containment: r.Containment, Unit: r.Unit}
}

// OwnershipReceipt is the wire form (spec/work.tsp OwnershipReceipt).
type OwnershipReceipt struct {
	PID          int    `json:"pid"`
	PGID         int    `json:"pgid"`
	ProcessStart string `json:"process_start"`
	BootID       string `json:"boot_id"`
	Generation   int    `json:"generation"`
	StartedAt    string `json:"started_at"`
	Containment  string `json:"containment"`
	Unit         string `json:"unit,omitempty"`
}

// ErrNoIdentity means this platform cannot identify a process beyond its id, so no receipt can be
// made and nothing will be signalled on the strength of one.
var ErrNoIdentity = errors.New("process identity is not available on this platform")

// NewReceipt records the identity of a process the daemon just started, in its containment unit.
func NewReceipt(runID, token string, pid, generation int, u Unit) (SpawnReceipt, error) {
	start, err := processStart(pid)
	if err != nil && !errors.Is(err, ErrNoIdentity) && !processExists(pid) || errors.Is(err, errNotRunning) {
		// The leader already exited (a very short run). Nothing can match it any more; whether the
		// run's unit still holds processes is Alive's question.
		start, err = "exited", nil
	}
	if err != nil {
		return SpawnReceipt{}, err
	}
	boot, err := bootID()
	if err != nil {
		return SpawnReceipt{}, err
	}
	mode := u.Mode
	if mode == "" {
		mode = ContainGroup
	}
	return SpawnReceipt{RunID: runID, ClaimToken: token, PID: pid, PGID: pid, ProcessStart: start, BootID: boot,
		Generation: generation, StartedAt: time.Now().UTC().Format(time.RFC3339), Containment: mode, Unit: u.Name, Cgroup: u.Cgroup}, nil
}

// Matches reports whether the receipt's leader process is still the one running now. Any doubt
// (the process is gone or a zombie, the boot changed, the start time differs, or identity cannot
// be read) is false. Whether the run as a whole is gone is Alive, which asks the unit.
func (r SpawnReceipt) Matches() bool {
	boot, err := bootID()
	if err != nil || boot != r.BootID {
		return false
	}
	start, err := processStart(r.PID)
	return err == nil && start == r.ProcessStart
}

// Receipts keeps one receipt file per running run under <home>/receipts, so a daemon that
// restarts can find the processes the previous one started.
type Receipts struct{ dir string }

// NewReceipts returns the receipt store under home.
func NewReceipts(home string) *Receipts { return &Receipts{dir: filepath.Join(home, "receipts")} }

func (s *Receipts) path(runID string) string {
	return filepath.Join(s.dir, strings.Map(func(r rune) rune {
		if r == '/' || r == '\\' || r == 0 {
			return '_'
		}
		return r
	}, runID)+".json")
}

// Put writes a receipt durably and atomically, readable only by the daemon's user (it holds the
// claim token): the file and its directory are synced, so a crash leaves either no receipt or a
// whole one.
func (s *Receipts) Put(r SpawnReceipt) error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return fmt.Errorf("receipts: %w", err)
	}
	b, err := json.Marshal(r)
	if err != nil {
		return err
	}
	tmp := s.path(r.RunID) + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return fmt.Errorf("receipts: %w", err)
	}
	if _, err := f.Write(b); err != nil {
		f.Close()
		return fmt.Errorf("receipts: %w", err)
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return fmt.Errorf("receipts: %w", err)
	}
	if err := f.Close(); err != nil {
		return fmt.Errorf("receipts: %w", err)
	}
	if err := os.Rename(tmp, s.path(r.RunID)); err != nil {
		return fmt.Errorf("receipts: %w", err)
	}
	return syncDir(s.dir)
}

// Remove forgets a receipt once its process exit has been observed and reported.
func (s *Receipts) Remove(runID string) { _ = os.Remove(s.path(runID)) }

// List returns every retained receipt. An unreadable file is skipped, never acted on.
func (s *Receipts) List() ([]SpawnReceipt, error) {
	entries, err := os.ReadDir(s.dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []SpawnReceipt
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		b, err := os.ReadFile(filepath.Join(s.dir, e.Name()))
		if err != nil {
			continue
		}
		var r SpawnReceipt
		if json.Unmarshal(b, &r) != nil || r.RunID == "" || r.PID <= 0 {
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

// syncDir makes a rename in dir durable. Its failure is returned: a caller that retires other
// evidence after a durable write must know the write may not survive a crash.
func syncDir(dir string) error {
	d, err := os.Open(dir)
	if err != nil {
		return fmt.Errorf("sync %s: %w", dir, err)
	}
	defer d.Close()
	if err := d.Sync(); err != nil {
		return fmt.Errorf("sync %s: %w", dir, err)
	}
	return nil
}
