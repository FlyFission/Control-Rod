package scmobserver

import (
	"fmt"
	"sync"
)

// RawFetchResult is one raw transport response corresponding positionally to a
// requested PRRef.
type RawFetchResult struct {
	Identity PRIdentity
	Fetched  bool
	Snapshot *PRSnapshot
	Err      error
}

// BatchItem is the validated, positionally attributed result for requested[i].
type BatchItem struct {
	Requested PRIdentity
	Repo      string
	Fetched   bool
	Snapshot  *PRSnapshot
	Hashes    SemanticHashes
	Error     error
}

// RepoCursorState holds the persisted monotonic ETag and cursor for one repo.
type RepoCursorState struct {
	Repo     string
	ETag     string
	Cursor   string
	Sequence uint64
}

// RepoCursorCandidate proposes a new ETag/cursor observed during a batch poll.
type RepoCursorCandidate struct {
	ETag     string
	Cursor   string
	Sequence uint64
}

// RepoCursorUpdate records whether a repository's ETag/cursor advanced.
type RepoCursorUpdate struct {
	Repo           string
	PreviousETag   string
	NextETag       string
	PreviousCursor string
	NextCursor     string
	Sequence       uint64
	Advanced       bool
	BlockedReason  string
}

// BatchResult holds positionally aligned poll items and per-repo cursor updates.
type BatchResult struct {
	Items       []BatchItem
	RepoUpdates map[string]RepoCursorUpdate
}

// BuildBatchResult enforces positional attribution (results[i] answers requested[i]),
// strips any payload when Fetched=false or Err!=nil, computes SemanticHashes for
// fetched snapshots, and guards repo ETag/cursors against advancing when any ref
// in that repo fails or when Sequence regresses.
func BuildBatchResult(
	requested []PRRef,
	raw []RawFetchResult,
	prevCursors map[string]RepoCursorState,
	candidates map[string]RepoCursorCandidate,
) (BatchResult, map[string]RepoCursorState, error) {
	if len(raw) != len(requested) {
		return BatchResult{}, nil, fmt.Errorf("%w: requested %d, got %d", ErrBatchMismatch, len(requested), len(raw))
	}

	items := make([]BatchItem, len(requested))
	repoFailed := make(map[string]bool)
	reposSeen := make(map[string]bool)

	for i, req := range requested {
		reqID := req.Identity.Normalized()
		if err := reqID.Validate(); err != nil {
			return BatchResult{}, nil, err
		}
		repo := req.Repo
		if repo != "" {
			reposSeen[repo] = true
		}

		r := raw[i]
		if r.Identity != (PRIdentity{}) && r.Identity.Normalized() != reqID {
			return BatchResult{}, nil, fmt.Errorf(
				"%w: index %d requested %s, got %s",
				ErrBatchMismatch, i, reqID.Key(), r.Identity.Normalized().Key(),
			)
		}

		item := BatchItem{
			Requested: reqID,
			Repo:      repo,
			Error:     r.Err,
		}

		if r.Err != nil {
			if repo != "" {
				repoFailed[repo] = true
			}
			// Fetched=false stripping on error.
			items[i] = item
			continue
		}

		if !r.Fetched || r.Snapshot == nil {
			// Fetched=false stripping: discard any partial snapshot or hashes.
			item.Fetched = false
			item.Snapshot = nil
			item.Hashes = SemanticHashes{}
			items[i] = item
			continue
		}

		snapCopy := *r.Snapshot
		snapCopy.Identity = reqID
		if snapCopy.Repo == "" {
			snapCopy.Repo = repo
		}
		item.Fetched = true
		item.Snapshot = &snapCopy
		item.Hashes = ComputeSemanticHashes(snapCopy)
		items[i] = item
	}

	nextCursors := make(map[string]RepoCursorState, len(prevCursors)+len(reposSeen))
	for repo, st := range prevCursors {
		nextCursors[repo] = st
	}
	updates := make(map[string]RepoCursorUpdate, len(reposSeen))

	for repo := range reposSeen {
		prev := prevCursors[repo]
		cand, hasCand := candidates[repo]

		upd := RepoCursorUpdate{
			Repo:           repo,
			PreviousETag:   prev.ETag,
			NextETag:       prev.ETag,
			PreviousCursor: prev.Cursor,
			NextCursor:     prev.Cursor,
			Sequence:       prev.Sequence,
			Advanced:       false,
		}

		switch {
		case repoFailed[repo]:
			upd.BlockedReason = "partial_repo_failure"
		case !hasCand:
			upd.BlockedReason = "no_candidate"
		case cand.Sequence < prev.Sequence:
			upd.BlockedReason = "cursor_regression"
		case prev.Cursor != "" && cand.Cursor == "" && cand.Sequence == prev.Sequence:
			upd.BlockedReason = "empty_cursor"
		default:
			nextETag := prev.ETag
			if cand.ETag != "" {
				nextETag = cand.ETag
			}
			nextCursor := prev.Cursor
			if cand.Cursor != "" {
				nextCursor = cand.Cursor
			}
			changed := nextETag != prev.ETag || nextCursor != prev.Cursor || cand.Sequence > prev.Sequence
			upd.NextETag = nextETag
			upd.NextCursor = nextCursor
			upd.Sequence = cand.Sequence
			upd.Advanced = changed
			nextCursors[repo] = RepoCursorState{
				Repo:     repo,
				ETag:     nextETag,
				Cursor:   nextCursor,
				Sequence: cand.Sequence,
			}
		}
		updates[repo] = upd
	}

	return BatchResult{Items: items, RepoUpdates: updates}, nextCursors, nil
}

// AckDelta describes unacknowledged semantic changes between Observed and Acknowledged.
type AckDelta struct {
	Identity        PRIdentity
	Observed        SemanticHashes
	Acknowledged    SemanticHashes
	ChangedMetadata bool
	ChangedCI       bool
	ChangedReview   bool
}

// HasChanges reports whether any semantic dimension differs from Acknowledged.
func (d AckDelta) HasChanges() bool {
	return d.ChangedMetadata || d.ChangedCI || d.ChangedReview
}

type ackEntry struct {
	observed     SemanticHashes
	acknowledged SemanticHashes
}

// AckTracker implements two-phase semantic-hash acknowledgement:
// Phase 1 (Observe) records newly observed hashes without acknowledging them.
// Phase 2 (Acknowledge) commits the acknowledged hashes only for dimensions that
// still match what was processed, preserving concurrent newer updates.
type AckTracker struct {
	mu      sync.Mutex
	entries map[PRIdentity]ackEntry
}

// NewAckTracker creates a new AckTracker.
func NewAckTracker() *AckTracker {
	return &AckTracker{entries: make(map[PRIdentity]ackEntry)}
}

// Observe records newly observed SemanticHashes for id (Phase 1) and returns
// the unacknowledged delta.
func (a *AckTracker) Observe(id PRIdentity, observed SemanticHashes) AckDelta {
	key := id.Normalized()
	a.mu.Lock()
	defer a.mu.Unlock()

	entry := a.entries[key]
	entry.observed = observed
	a.entries[key] = entry
	return buildDelta(key, entry)
}

// Acknowledge marks processed hashes as acknowledged (Phase 2). If observed has
// already moved ahead on a dimension since processing began, that dimension
// stays dirty until the newer hash is processed and acknowledged.
func (a *AckTracker) Acknowledge(id PRIdentity, acked SemanticHashes) AckDelta {
	key := id.Normalized()
	a.mu.Lock()
	defer a.mu.Unlock()

	entry := a.entries[key]
	if entry.observed.MetadataHash == acked.MetadataHash {
		entry.acknowledged.MetadataHash = acked.MetadataHash
	}
	if entry.observed.CIHash == acked.CIHash {
		entry.acknowledged.CIHash = acked.CIHash
	}
	if entry.observed.ReviewHash == acked.ReviewHash {
		entry.acknowledged.ReviewHash = acked.ReviewHash
	}
	a.entries[key] = entry
	return buildDelta(key, entry)
}

// Pending returns the current unacknowledged delta for id, if tracked.
func (a *AckTracker) Pending(id PRIdentity) (AckDelta, bool) {
	key := id.Normalized()
	a.mu.Lock()
	defer a.mu.Unlock()

	entry, ok := a.entries[key]
	if !ok {
		return AckDelta{}, false
	}
	return buildDelta(key, entry), true
}

// Evict removes tracking state for id (for example, on terminal PR eviction).
func (a *AckTracker) Evict(id PRIdentity) {
	key := id.Normalized()
	a.mu.Lock()
	defer a.mu.Unlock()
	delete(a.entries, key)
}

func buildDelta(id PRIdentity, e ackEntry) AckDelta {
	return AckDelta{
		Identity:        id,
		Observed:        e.observed,
		Acknowledged:    e.acknowledged,
		ChangedMetadata: e.observed.MetadataHash != "" && e.observed.MetadataHash != e.acknowledged.MetadataHash,
		ChangedCI:       e.observed.CIHash != "" && e.observed.CIHash != e.acknowledged.CIHash,
		ChangedReview:   e.observed.ReviewHash != "" && e.observed.ReviewHash != e.acknowledged.ReviewHash,
	}
}
