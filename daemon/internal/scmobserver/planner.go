package scmobserver

import (
	"errors"
	"fmt"
	"sync"
	"time"
)

// ReviewStatus is the planned review status for a (PRIdentity, HeadSHA) pair.
type ReviewStatus string

const (
	ReviewNeedsReview      ReviewStatus = "needs_review"
	ReviewRunning          ReviewStatus = "running"
	ReviewUpToDate         ReviewStatus = "up_to_date"
	ReviewChangesRequested ReviewStatus = "changes_requested"
	ReviewIneligible       ReviewStatus = "ineligible"
)

// ReviewRunState tracks the execution state of an individual review run.
type ReviewRunState string

const (
	RunRunning   ReviewRunState = "running"
	RunCompleted ReviewRunState = "completed"
	RunFailed    ReviewRunState = "failed"
	RunCancelled ReviewRunState = "cancelled"
)

// ReviewVerdict records the outcome of a completed review run.
type ReviewVerdict string

const (
	VerdictNone             ReviewVerdict = ""
	VerdictApproved         ReviewVerdict = "approved"
	VerdictChangesRequested ReviewVerdict = "changes_requested"
	VerdictCommented        ReviewVerdict = "commented"
)

// ReviewKey keys review planning strictly by immutable (PRIdentity, HeadSHA).
type ReviewKey struct {
	PR      PRIdentity
	HeadSHA string
}

// ReviewRun describes one checker/review run bound to a specific HeadSHA.
type ReviewRun struct {
	RunID                 string
	HeadSHA               string
	State                 ReviewRunState
	Verdict               ReviewVerdict
	StartedAt             time.Time
	CompletedAt           time.Time
	ReleaseManifestDigest string
	DecisionDigest        string
}

// ReviewRecord captures the computed status plus LatestRun and PreviousRun.
type ReviewRecord struct {
	Key         ReviewKey
	Status      ReviewStatus
	Reason      string
	LatestRun   *ReviewRun
	PreviousRun *ReviewRun
}

type plannerEntry struct {
	latest   *ReviewRun
	previous *ReviewRun
}

// ReviewPlanner computes per-(PRIdentity, HeadSHA) review statuses while tracking
// both LatestRun and PreviousRun.
type ReviewPlanner struct {
	mu      sync.Mutex
	records map[ReviewKey]plannerEntry
}

// NewReviewPlanner creates an empty ReviewPlanner.
func NewReviewPlanner() *ReviewPlanner {
	return &ReviewPlanner{records: make(map[ReviewKey]plannerEntry)}
}

// StartRun records a newly started review run for (id, headSHA), rotating any
// existing LatestRun into PreviousRun.
func (p *ReviewPlanner) StartRun(id PRIdentity, headSHA string, run ReviewRun) error {
	norm := id.Normalized()
	if err := norm.Validate(); err != nil {
		return err
	}
	if headSHA == "" || run.RunID == "" {
		return errors.New("scmobserver: headSHA and runID are required")
	}
	run.HeadSHA = headSHA
	if run.State == "" {
		run.State = RunRunning
	}

	key := ReviewKey{PR: norm, HeadSHA: headSHA}
	p.mu.Lock()
	defer p.mu.Unlock()

	cur := p.records[key]
	var prev *ReviewRun
	if cur.latest != nil {
		cp := *cur.latest
		prev = &cp
	} else {
		prev = cur.previous
	}
	next := run
	p.records[key] = plannerEntry{latest: &next, previous: prev}
	return nil
}

// CompleteRun updates the active LatestRun for (id, headSHA) with its completion
// state, verdict, and attested digests.
func (p *ReviewPlanner) CompleteRun(
	id PRIdentity,
	headSHA string,
	runID string,
	state ReviewRunState,
	verdict ReviewVerdict,
	completedAt time.Time,
	releaseDigest string,
	decisionDigest string,
) error {
	norm := id.Normalized()
	key := ReviewKey{PR: norm, HeadSHA: headSHA}

	p.mu.Lock()
	defer p.mu.Unlock()

	cur, ok := p.records[key]
	if !ok || cur.latest == nil || cur.latest.RunID != runID {
		return fmt.Errorf("scmobserver: active run %q not found for %s@%s", runID, norm.Key(), headSHA)
	}
	updated := *cur.latest
	updated.State = state
	updated.Verdict = verdict
	updated.CompletedAt = completedAt
	updated.ReleaseManifestDigest = releaseDigest
	updated.DecisionDigest = decisionDigest
	cur.latest = &updated
	p.records[key] = cur
	return nil
}

// Evaluate computes the per-(PRIdentity, HeadSHA) ReviewRecord for snap.
func (p *ReviewPlanner) Evaluate(snap PRSnapshot) (ReviewRecord, error) {
	norm := snap.Identity.Normalized()
	if err := norm.Validate(); err != nil {
		return ReviewRecord{}, err
	}
	key := ReviewKey{PR: norm, HeadSHA: snap.HeadSHA}

	p.mu.Lock()
	cur := p.records[key]
	p.mu.Unlock()

	rec := ReviewRecord{
		Key:         key,
		LatestRun:   cloneRun(cur.latest),
		PreviousRun: cloneRun(cur.previous),
	}

	if snap.State.IsTerminal() {
		rec.Status = ReviewIneligible
		rec.Reason = "terminal"
		return rec, nil
	}
	if snap.Draft {
		rec.Status = ReviewIneligible
		rec.Reason = "draft"
		return rec, nil
	}
	if snap.HeadSHA == "" {
		rec.Status = ReviewIneligible
		rec.Reason = "missing_head_sha"
		return rec, nil
	}

	if cur.latest == nil || cur.latest.HeadSHA != snap.HeadSHA {
		rec.Status = ReviewNeedsReview
		rec.Reason = "unreviewed_head_sha"
		return rec, nil
	}

	switch cur.latest.State {
	case RunRunning:
		rec.Status = ReviewRunning
	case RunCompleted:
		switch cur.latest.Verdict {
		case VerdictChangesRequested:
			rec.Status = ReviewChangesRequested
		case VerdictApproved, VerdictCommented:
			rec.Status = ReviewUpToDate
		default:
			rec.Status = ReviewNeedsReview
			rec.Reason = "missing_verdict"
		}
	case RunFailed, RunCancelled:
		rec.Status = ReviewNeedsReview
		rec.Reason = string(cur.latest.State)
	default:
		rec.Status = ReviewNeedsReview
	}

	return rec, nil
}

// Record returns the raw stored LatestRun/PreviousRun pair for (id, headSHA).
func (p *ReviewPlanner) Record(id PRIdentity, headSHA string) (latest, previous *ReviewRun, ok bool) {
	key := ReviewKey{PR: id.Normalized(), HeadSHA: headSHA}
	p.mu.Lock()
	defer p.mu.Unlock()
	cur, exists := p.records[key]
	if !exists {
		return nil, nil, false
	}
	return cloneRun(cur.latest), cloneRun(cur.previous), true
}

func cloneRun(r *ReviewRun) *ReviewRun {
	if r == nil {
		return nil
	}
	cp := *r
	return &cp
}
