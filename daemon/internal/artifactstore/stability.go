package artifactstore

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// StabilityOptions configures two-poll (size, mtime) stability checks.
type StabilityOptions struct {
	// MinPolls is the number of consecutive matching (size, mtime) observations
	// required before a file is considered stable. Defaults to 2 when < 2.
	MinPolls int
	// MinStableDuration optionally requires elapsed time between the first and
	// latest matching observation. Defaults to 0 (any two matching polls pass).
	MinStableDuration time.Duration
	// Now overrides time.Now when set.
	Now func() time.Time
}

// StabilitySample records the current stability observation for a path.
type StabilitySample struct {
	Path      string
	Size      int64
	ModTime   time.Time
	FirstSeen time.Time
	LastSeen  time.Time
	Polls     int
	Stable    bool
}

// StabilityTracker tracks consecutive (size, mtime) observations across polls
// so files still being written in outside workspaces are not captured mid-write.
type StabilityTracker struct {
	mu       sync.Mutex
	minPolls int
	minDur   time.Duration
	now      func() time.Time
	entries  map[string]StabilitySample
}

// NewStabilityTracker constructs a StabilityTracker with the provided options.
func NewStabilityTracker(opts StabilityOptions) *StabilityTracker {
	minPolls := opts.MinPolls
	if minPolls < 2 {
		minPolls = 2
	}
	now := opts.Now
	if now == nil {
		now = func() time.Time { return time.Now().UTC() }
	}
	return &StabilityTracker{
		minPolls: minPolls,
		minDur:   opts.MinStableDuration,
		now:      now,
		entries:  make(map[string]StabilitySample),
	}
}

// Observe records a (size, modTime) poll for path at the tracker's current time
// and reports whether the file is now stable.
func (t *StabilityTracker) Observe(path string, size int64, modTime time.Time) bool {
	return t.ObserveAt(path, size, modTime, t.now())
}

// ObserveAt records a (size, modTime) poll for path at observedAt and reports
// whether the file is now stable.
func (t *StabilityTracker) ObserveAt(path string, size int64, modTime time.Time, observedAt time.Time) bool {
	key := filepath.Clean(path)
	t.mu.Lock()
	defer t.mu.Unlock()

	prev, ok := t.entries[key]
	if !ok || prev.Size != size || !prev.ModTime.Equal(modTime) {
		t.entries[key] = StabilitySample{
			Path:      key,
			Size:      size,
			ModTime:   modTime,
			FirstSeen: observedAt,
			LastSeen:  observedAt,
			Polls:     1,
			Stable:    false,
		}
		return false
	}

	prev.Polls++
	prev.LastSeen = observedAt
	prev.Stable = prev.Polls >= t.minPolls && observedAt.Sub(prev.FirstSeen) >= t.minDur
	t.entries[key] = prev
	return prev.Stable
}

// PollFile stats path with os.Lstat (refusing symlinks and non-regular files)
// and updates stability state.
func (t *StabilityTracker) PollFile(path string) (os.FileInfo, bool, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, false, err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return nil, false, fmt.Errorf("%w: %s", ErrSymlinkRefused, path)
	}
	if !info.Mode().IsRegular() {
		return nil, false, fmt.Errorf("artifactstore: %s is not a regular file", path)
	}
	return info, t.Observe(path, info.Size(), info.ModTime()), nil
}

// PollRoot stats relPath inside root via root.Lstat (refusing symlinks and
// non-regular files) and updates stability state.
func (t *StabilityTracker) PollRoot(root *os.Root, relPath string) (os.FileInfo, bool, error) {
	info, err := root.Lstat(relPath)
	if err != nil {
		return nil, false, err
	}
	if info.Mode()&fs.ModeSymlink != 0 {
		return nil, false, fmt.Errorf("%w: %s", ErrSymlinkRefused, relPath)
	}
	if !info.Mode().IsRegular() {
		return nil, false, fmt.Errorf("artifactstore: %s is not a regular file", relPath)
	}
	return info, t.Observe(relPath, info.Size(), info.ModTime()), nil
}

// Sample returns the latest recorded sample for path, if any.
func (t *StabilityTracker) Sample(path string) (StabilitySample, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	s, ok := t.entries[filepath.Clean(path)]
	return s, ok
}

// Forget removes tracking state for path.
func (t *StabilityTracker) Forget(path string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.entries, filepath.Clean(path))
}

// Reset clears all tracked stability samples.
func (t *StabilityTracker) Reset() {
	t.mu.Lock()
	defer t.mu.Unlock()
	clear(t.entries)
}
