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
// A stop, an orphan sweep or a kill acts on a process only while the live process still matches
// it: same boot, same process id, same start time. A reused process id never matches.
type SpawnReceipt struct {
	RunID        string `json:"run_id"`
	ClaimToken   string `json:"claim_token"`
	PID          int    `json:"pid"`
	PGID         int    `json:"pgid"`
	ProcessStart string `json:"process_start"`
	BootID       string `json:"boot_id"`
	Generation   int    `json:"generation"`
	StartedAt    string `json:"started_at"`
	// Workspace is the run's directory, so a later daemon can revoke write access before stopping.
	Workspace string `json:"workspace"`
}

// Wire is the receipt as the control plane records it: no token, no local paths.
func (r SpawnReceipt) Wire() OwnershipReceipt {
	return OwnershipReceipt{PID: r.PID, PGID: r.PGID, ProcessStart: r.ProcessStart, BootID: r.BootID, Generation: r.Generation, StartedAt: r.StartedAt}
}

// OwnershipReceipt is the wire form (spec/work.tsp OwnershipReceipt).
type OwnershipReceipt struct {
	PID          int    `json:"pid"`
	PGID         int    `json:"pgid"`
	ProcessStart string `json:"process_start"`
	BootID       string `json:"boot_id"`
	Generation   int    `json:"generation"`
	StartedAt    string `json:"started_at"`
}

// ErrNoIdentity means this platform cannot identify a process beyond its id, so no receipt can be
// made and nothing will be signalled on the strength of one.
var ErrNoIdentity = errors.New("process identity is not available on this platform")

// NewReceipt records the identity of a process the daemon just started.
func NewReceipt(runID, token string, pid, generation int, workspace string) (SpawnReceipt, error) {
	start, err := processStart(pid)
	if err != nil {
		return SpawnReceipt{}, err
	}
	boot, err := bootID()
	if err != nil {
		return SpawnReceipt{}, err
	}
	return SpawnReceipt{RunID: runID, ClaimToken: token, PID: pid, PGID: pid, ProcessStart: start, BootID: boot,
		Generation: generation, StartedAt: time.Now().UTC().Format(time.RFC3339), Workspace: workspace}, nil
}

// Matches reports whether the receipt's process is still the one running now. Any doubt (the
// process is gone, the boot changed, the start time differs, or identity cannot be read) is false.
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

// Put writes a receipt atomically, readable only by the daemon's user (it holds the claim token).
func (s *Receipts) Put(r SpawnReceipt) error {
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		return fmt.Errorf("receipts: %w", err)
	}
	b, err := json.Marshal(r)
	if err != nil {
		return err
	}
	tmp := s.path(r.RunID) + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return fmt.Errorf("receipts: %w", err)
	}
	return os.Rename(tmp, s.path(r.RunID))
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

// RevokeWrite removes write permission from everything under dir, so a process being stopped can
// no longer change the workspace (specification 22: write authority is revoked first). Errors on
// single entries are ignored: the stop proceeds either way.
func RevokeWrite(dir string) {
	if dir == "" {
		return
	}
	_ = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		_ = os.Chmod(p, info.Mode().Perm()&^0o222)
		return nil
	})
}

// RestoreWrite gives the daemon's user write access back, so a workspace can be cleaned up later.
func RestoreWrite(dir string) {
	if dir == "" {
		return
	}
	_ = filepath.WalkDir(dir, func(p string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		info, err := d.Info()
		if err != nil || info.Mode()&os.ModeSymlink != 0 {
			return nil
		}
		_ = os.Chmod(p, info.Mode().Perm()|0o200)
		return nil
	})
}
