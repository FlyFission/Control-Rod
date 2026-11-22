package scmobserver

import (
	"slices"
	"strings"
	"sync"
	"time"
)

// CheckRun represents a single CI check-run observation.
type CheckRun struct {
	ID          string
	Name        string
	HeadSHA     string
	Status      string
	Conclusion  string
	StartedAt   time.Time
	CompletedAt time.Time
	UpdatedAt   time.Time
}

// CIState is the aggregated CI status on a PR's current head_sha.
type CIState string

const (
	CINone    CIState = "none"
	CIPassing CIState = "passing"
	CIPending CIState = "pending"
	CIFailing CIState = "failing"
)

// ReducedCI holds the latest-per-check-name CI state on a single HeadSHA.
type ReducedCI struct {
	HeadSHA       string
	State         CIState
	LatestByCheck map[string]CheckRun
	FailingChecks []string
	PendingChecks []string
}

// ReduceCheckRuns reduces check runs to the latest run per check name on headSHA,
// ignoring stale runs on other SHAs and honoring CANCELLED as failing.
func ReduceCheckRuns(headSHA string, runs []CheckRun) ReducedCI {
	latest := make(map[string]CheckRun)
	for _, r := range runs {
		if r.HeadSHA != headSHA || strings.TrimSpace(r.Name) == "" {
			continue
		}
		prev, exists := latest[r.Name]
		if !exists || checkRunAfter(r, prev) {
			latest[r.Name] = r
		}
	}

	if len(latest) == 0 {
		return ReducedCI{
			HeadSHA:       headSHA,
			State:         CINone,
			LatestByCheck: latest,
		}
	}

	var failing, pending []string
	for name, r := range latest {
		switch classifyCheckRun(r) {
		case CIFailing:
			failing = append(failing, name)
		case CIPending:
			pending = append(pending, name)
		}
	}
	slices.Sort(failing)
	slices.Sort(pending)

	state := CIPassing
	if len(failing) > 0 {
		state = CIFailing
	} else if len(pending) > 0 {
		state = CIPending
	}

	return ReducedCI{
		HeadSHA:       headSHA,
		State:         state,
		LatestByCheck: latest,
		FailingChecks: failing,
		PendingChecks: pending,
	}
}

func checkRunAfter(candidate, current CheckRun) bool {
	ct := latestTimestamp(candidate)
	pt := latestTimestamp(current)
	if !ct.Equal(pt) {
		return ct.After(pt)
	}
	return candidate.ID > current.ID
}

func latestTimestamp(r CheckRun) time.Time {
	t := r.CompletedAt
	if r.UpdatedAt.After(t) {
		t = r.UpdatedAt
	}
	if r.StartedAt.After(t) {
		t = r.StartedAt
	}
	return t
}

func classifyCheckRun(r CheckRun) CIState {
	status := strings.ToLower(strings.TrimSpace(r.Status))
	conclusion := strings.ToLower(strings.TrimSpace(r.Conclusion))

	if status != "" && status != "completed" && conclusion == "" {
		return CIPending
	}

	switch conclusion {
	case "success", "neutral", "skipped":
		return CIPassing
	case "failure", "timed_out", "action_required", "startup_failure", "cancelled", "canceled":
		return CIFailing
	case "":
		return CIPending
	default:
		// Fail closed on unrecognized conclusions.
		return CIFailing
	}
}

type queueEntry struct {
	ref   PRRef
	draft bool
}

// PollQueue manages active PR poll targets, evicting terminal PRs (merged/closed)
// and excluding draft PRs from review eligibility.
type PollQueue struct {
	mu      sync.Mutex
	order   []PRIdentity
	entries map[PRIdentity]queueEntry
	evicted []PRIdentity
}

// NewPollQueue constructs an empty PollQueue.
func NewPollQueue() *PollQueue {
	return &PollQueue{
		entries: make(map[PRIdentity]queueEntry),
	}
}

// Enqueue adds or updates a PRRef in the poll queue.
func (q *PollQueue) Enqueue(ref PRRef, draft bool) error {
	id := ref.Identity.Normalized()
	if err := id.Validate(); err != nil {
		return err
	}
	ref.Identity = id

	q.mu.Lock()
	defer q.mu.Unlock()
	if _, exists := q.entries[id]; !exists {
		q.order = append(q.order, id)
	}
	q.entries[id] = queueEntry{ref: ref, draft: draft}
	return nil
}

// ApplySnapshot updates queue state from a PR snapshot, evicting terminal
// (merged/closed) PRs and updating draft status.
func (q *PollQueue) ApplySnapshot(snap PRSnapshot) (evicted bool, excludedDraft bool) {
	id := snap.Identity.Normalized()

	q.mu.Lock()
	defer q.mu.Unlock()

	if snap.State.IsTerminal() {
		if _, exists := q.entries[id]; exists {
			delete(q.entries, id)
			q.removeOrderLocked(id)
			q.evicted = append(q.evicted, id)
			return true, snap.Draft
		}
		return false, snap.Draft
	}

	if _, exists := q.entries[id]; !exists {
		q.order = append(q.order, id)
	}
	q.entries[id] = queueEntry{
		ref:   PRRef{Identity: id, Repo: snap.Repo, Number: snap.Number},
		draft: snap.Draft,
	}
	return false, snap.Draft
}

// PollTargets returns all active non-terminal PRRefs in enqueue order.
func (q *PollQueue) PollTargets() []PRRef {
	q.mu.Lock()
	defer q.mu.Unlock()
	out := make([]PRRef, 0, len(q.order))
	for _, id := range q.order {
		if e, ok := q.entries[id]; ok {
			out = append(out, e.ref)
		}
	}
	return out
}

// ReviewEligibleTargets returns active non-terminal, non-draft PRRefs.
func (q *PollQueue) ReviewEligibleTargets() []PRRef {
	q.mu.Lock()
	defer q.mu.Unlock()
	out := make([]PRRef, 0, len(q.order))
	for _, id := range q.order {
		if e, ok := q.entries[id]; ok && !e.draft {
			out = append(out, e.ref)
		}
	}
	return out
}

// Contains reports whether id is currently queued.
func (q *PollQueue) Contains(id PRIdentity) bool {
	q.mu.Lock()
	defer q.mu.Unlock()
	_, ok := q.entries[id.Normalized()]
	return ok
}

// Len returns the number of active PRs in the queue.
func (q *PollQueue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.entries)
}

// Evicted returns a copy of PR identities evicted due to terminal states.
func (q *PollQueue) Evicted() []PRIdentity {
	q.mu.Lock()
	defer q.mu.Unlock()
	return append([]PRIdentity(nil), q.evicted...)
}

func (q *PollQueue) removeOrderLocked(id PRIdentity) {
	for i, existing := range q.order {
		if existing == id {
			q.order = append(q.order[:i], q.order[i+1:]...)
			return
		}
	}
}
