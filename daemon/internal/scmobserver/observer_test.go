package scmobserver

import (
	"errors"
	"testing"
	"time"
)

func TestPRIdentityKeyedByImmutableProviderID(t *testing.T) {
	id1, err := NewPRIdentity("GitHub", "GitHub.COM", "PR_kwDO123")
	if err != nil {
		t.Fatal(err)
	}
	id2, err := NewPRIdentity("github", "github.com", "PR_kwDO123")
	if err != nil {
		t.Fatal(err)
	}
	if id1 != id2 || id1.Key() != "github:github.com:PR_kwDO123" {
		t.Fatalf("expected normalized immutable identity match, got %+v vs %+v", id1, id2)
	}

	// Mutable owner/repo#number changes on PRRef do not alter PRIdentity key.
	refA := PRRef{Identity: id1, Repo: "org/old-name", Number: 10}
	refB := PRRef{Identity: id2, Repo: "org/renamed", Number: 10}
	if refA.Identity != refB.Identity {
		t.Fatalf("PRIdentity must remain invariant across repo renames")
	}

	if _, err := NewPRIdentity("", "github.com", "PR_1"); !errors.Is(err, ErrInvalidIdentity) {
		t.Fatalf("expected ErrInvalidIdentity for empty provider, got %v", err)
	}
}

func TestBatchResultPositionalAttributionCursorGuardAndStripping(t *testing.T) {
	idA, _ := NewPRIdentity("github", "github.com", "PR_A")
	idB, _ := NewPRIdentity("github", "github.com", "PR_B")
	idC, _ := NewPRIdentity("github", "github.com", "PR_C")

	requested := []PRRef{
		{Identity: idA, Repo: "acme/repo1", Number: 1},
		{Identity: idB, Repo: "acme/repo1", Number: 2},
		{Identity: idC, Repo: "acme/repo2", Number: 3},
	}

	prevCursors := map[string]RepoCursorState{
		"acme/repo1": {Repo: "acme/repo1", ETag: "etag-1", Cursor: "cur-1", Sequence: 10},
		"acme/repo2": {Repo: "acme/repo2", ETag: "etag-2", Cursor: "cur-2", Sequence: 20},
	}
	candidates := map[string]RepoCursorCandidate{
		"acme/repo1": {ETag: "etag-1-new", Cursor: "cur-1-new", Sequence: 11},
		"acme/repo2": {ETag: "etag-2-new", Cursor: "cur-2-new", Sequence: 21},
	}

	// Repo1 has one failing ref (idB) and one Fetched=false ref (idA) with a stale
	// snapshot that must be stripped. Repo2 succeeds completely.
	raw := []RawFetchResult{
		{
			Identity: idA,
			Fetched:  false,
			Snapshot: &PRSnapshot{Identity: idA, Title: "stale-should-be-stripped", HeadSHA: "sha-stale"},
		},
		{
			Identity: idB,
			Fetched:  true,
			Err:      errors.New("transient rate limit"),
		},
		{
			Identity: idC,
			Fetched:  true,
			Snapshot: &PRSnapshot{Identity: idC, Repo: "acme/repo2", State: StateOpen, Title: "clean", HeadSHA: "sha-c"},
		},
	}

	res, nextCursors, err := BuildBatchResult(requested, raw, prevCursors, candidates)
	if err != nil {
		t.Fatalf("BuildBatchResult failed: %v", err)
	}

	// Positional attribution check.
	if res.Items[0].Requested != idA || res.Items[1].Requested != idB || res.Items[2].Requested != idC {
		t.Fatalf("positional attribution violated: %+v", res.Items)
	}

	// Fetched=false stripping check.
	if res.Items[0].Fetched || res.Items[0].Snapshot != nil || res.Items[0].Hashes != (SemanticHashes{}) {
		t.Fatalf("expected Fetched=false snapshot and hashes stripped, got %+v", res.Items[0])
	}

	// Repo1 cursor must NOT advance because idB failed.
	if res.RepoUpdates["acme/repo1"].Advanced || nextCursors["acme/repo1"].ETag != "etag-1" || nextCursors["acme/repo1"].Cursor != "cur-1" {
		t.Fatalf("repo1 cursor should not advance on partial failure: %+v", res.RepoUpdates["acme/repo1"])
	}

	// Repo2 cursor MUST advance because all refs in repo2 succeeded.
	if !res.RepoUpdates["acme/repo2"].Advanced || nextCursors["acme/repo2"].ETag != "etag-2-new" || nextCursors["acme/repo2"].Cursor != "cur-2-new" {
		t.Fatalf("repo2 cursor should advance on full success: %+v", res.RepoUpdates["acme/repo2"])
	}

	// Mismatched identity at index 0 must error.
	badRaw := []RawFetchResult{{Identity: idB}, {Identity: idB}, {Identity: idC}}
	if _, _, err := BuildBatchResult(requested, badRaw, prevCursors, candidates); !errors.Is(err, ErrBatchMismatch) {
		t.Fatalf("expected ErrBatchMismatch, got %v", err)
	}
}

func TestTwoPhaseSemanticHashAcknowledgement(t *testing.T) {
	id, _ := NewPRIdentity("github", "github.com", "PR_1")
	tracker := NewAckTracker()

	h1 := ComputeSemanticHashes(PRSnapshot{
		Identity: id,
		State:    StateOpen,
		Title:    "Initial",
		HeadSHA:  "sha-1",
		CheckRuns: []CheckRun{
			{ID: "1", Name: "ci", HeadSHA: "sha-1", Status: "completed", Conclusion: "success"},
		},
	})

	// Phase 1: Observe marks all dimensions dirty.
	d1 := tracker.Observe(id, h1)
	if !d1.HasChanges() || !d1.ChangedMetadata || !d1.ChangedCI || !d1.ChangedReview {
		t.Fatalf("expected initial observation to mark all hashes dirty: %+v", d1)
	}

	// Simulate newer CI poll arriving concurrently before Phase 2 ack completes.
	h2 := h1
	h2.CIHash = "ci-hash-newer"
	d2 := tracker.Observe(id, h2)
	if !d2.ChangedCI {
		t.Fatalf("expected CI change")
	}

	// Phase 2: Acking h1 clears Metadata & Review, but keeps CI dirty because Observed moved to h2.CIHash!
	d3 := tracker.Acknowledge(id, h1)
	if d3.ChangedMetadata || d3.ChangedReview {
		t.Fatalf("expected Metadata and Review to be acknowledged: %+v", d3)
	}
	if !d3.ChangedCI {
		t.Fatalf("expected CI to remain unacknowledged after concurrent update: %+v", d3)
	}

	// Acking h2 clears remaining CI delta.
	d4 := tracker.Acknowledge(id, h2)
	if d4.HasChanges() {
		t.Fatalf("expected no pending changes after full ack: %+v", d4)
	}
}

func TestTerminalPREvictionAndDraftExclusion(t *testing.T) {
	idOpen, _ := NewPRIdentity("github", "github.com", "PR_OPEN")
	idDraft, _ := NewPRIdentity("github", "github.com", "PR_DRAFT")
	idMerged, _ := NewPRIdentity("github", "github.com", "PR_MERGED")
	idClosed, _ := NewPRIdentity("github", "github.com", "PR_CLOSED")

	q := NewPollQueue()
	q.ApplySnapshot(PRSnapshot{Identity: idOpen, State: StateOpen, Draft: false, HeadSHA: "s1"})
	q.ApplySnapshot(PRSnapshot{Identity: idDraft, State: StateOpen, Draft: true, HeadSHA: "s2"})
	q.ApplySnapshot(PRSnapshot{Identity: idMerged, State: StateOpen, Draft: false, HeadSHA: "s3"})
	q.ApplySnapshot(PRSnapshot{Identity: idClosed, State: StateOpen, Draft: false, HeadSHA: "s4"})

	if q.Len() != 4 {
		t.Fatalf("expected 4 active PRs, got %d", q.Len())
	}

	// Evict merged and closed PRs.
	if evicted, _ := q.ApplySnapshot(PRSnapshot{Identity: idMerged, State: StateMerged, HeadSHA: "s3"}); !evicted {
		t.Fatalf("expected merged PR to be evicted")
	}
	if evicted, _ := q.ApplySnapshot(PRSnapshot{Identity: idClosed, State: StateClosed, HeadSHA: "s4"}); !evicted {
		t.Fatalf("expected closed PR to be evicted")
	}
	if q.Contains(idMerged) || q.Contains(idClosed) {
		t.Fatalf("terminal PRs must not remain in poll queue")
	}
	if len(q.Evicted()) != 2 {
		t.Fatalf("expected 2 evicted PRs, got %d", len(q.Evicted()))
	}

	// Draft PR stays polled (to observe undraft) but is excluded from review eligibility.
	if len(q.PollTargets()) != 2 {
		t.Fatalf("expected 2 poll targets, got %d", len(q.PollTargets()))
	}
	eligible := q.ReviewEligibleTargets()
	if len(eligible) != 1 || eligible[0].Identity != idOpen {
		t.Fatalf("expected only non-draft open PR eligible for review, got %+v", eligible)
	}
}

func TestReduceCheckRunsCurrentHeadSHAAndCancelledAsFailing(t *testing.T) {
	t0 := time.Date(2026, 11, 22, 10, 0, 0, 0, time.UTC)
	runs := []CheckRun{
		// Stale failed run on old SHA must be ignored.
		{ID: "1", Name: "unit", HeadSHA: "old-sha", Status: "completed", Conclusion: "failure", CompletedAt: t0.Add(time.Minute)},
		// Older failure on current SHA superseded by newer success with same check name.
		{ID: "2", Name: "unit", HeadSHA: "cur-sha", Status: "completed", Conclusion: "failure", CompletedAt: t0},
		{ID: "3", Name: "unit", HeadSHA: "cur-sha", Status: "completed", Conclusion: "success", CompletedAt: t0.Add(2 * time.Minute)},
		// CANCELLED on current SHA must be honored as failing!
		{ID: "4", Name: "lint", HeadSHA: "cur-sha", Status: "completed", Conclusion: "CANCELLED", CompletedAt: t0.Add(time.Minute)},
	}

	reduced := ReduceCheckRuns("cur-sha", runs)
	if reduced.State != CIFailing {
		t.Fatalf("expected CIFailing because lint was CANCELLED, got %s", reduced.State)
	}
	if len(reduced.FailingChecks) != 1 || reduced.FailingChecks[0] != "lint" {
		t.Fatalf("expected only lint failing, got %v", reduced.FailingChecks)
	}

	// Without the cancelled check, stale failure on old-sha does not fail cur-sha.
	passing := ReduceCheckRuns("cur-sha", runs[:3])
	if passing.State != CIPassing {
		t.Fatalf("expected CIPassing (stale old-sha failure ignored), got %s", passing.State)
	}
}

func TestReviewPlannerStatusesAndStaleSHAInvalidation(t *testing.T) {
	id, _ := NewPRIdentity("github", "github.com", "PR_REV")
	planner := NewReviewPlanner()
	t0 := time.Date(2026, 11, 22, 11, 0, 0, 0, time.UTC)

	// Draft -> ineligible.
	rec, err := planner.Evaluate(PRSnapshot{Identity: id, State: StateOpen, Draft: true, HeadSHA: "sha-1"})
	if err != nil || rec.Status != ReviewIneligible {
		t.Fatalf("draft expected ineligible, got %+v err=%v", rec, err)
	}

	// Open non-draft with no runs -> needs_review.
	snap1 := PRSnapshot{Identity: id, State: StateOpen, Draft: false, HeadSHA: "sha-1"}
	rec, err = planner.Evaluate(snap1)
	if err != nil || rec.Status != ReviewNeedsReview {
		t.Fatalf("expected needs_review, got %+v err=%v", rec, err)
	}

	// Start run 1 -> running.
	if err := planner.StartRun(id, "sha-1", ReviewRun{RunID: "run-1", StartedAt: t0}); err != nil {
		t.Fatal(err)
	}
	rec, _ = planner.Evaluate(snap1)
	if rec.Status != ReviewRunning || rec.LatestRun.RunID != "run-1" || rec.PreviousRun != nil {
		t.Fatalf("expected running run-1 with nil previous, got %+v", rec)
	}

	// Complete run 1 with changes_requested.
	if err := planner.CompleteRun(id, "sha-1", "run-1", RunCompleted, VerdictChangesRequested, t0.Add(time.Minute), "rel-1", "dec-1"); err != nil {
		t.Fatal(err)
	}
	rec, _ = planner.Evaluate(snap1)
	if rec.Status != ReviewChangesRequested {
		t.Fatalf("expected changes_requested, got %+v", rec)
	}

	// Start run 2 on same SHA -> rotates run-1 to PreviousRun.
	if err := planner.StartRun(id, "sha-1", ReviewRun{RunID: "run-2", StartedAt: t0.Add(2 * time.Minute)}); err != nil {
		t.Fatal(err)
	}
	if err := planner.CompleteRun(id, "sha-1", "run-2", RunCompleted, VerdictApproved, t0.Add(3*time.Minute), "rel-2", "dec-2"); err != nil {
		t.Fatal(err)
	}
	rec, _ = planner.Evaluate(snap1)
	if rec.Status != ReviewUpToDate || rec.LatestRun.RunID != "run-2" || rec.PreviousRun == nil || rec.PreviousRun.RunID != "run-1" {
		t.Fatalf("expected up_to_date with run-2 latest and run-1 previous, got %+v", rec)
	}

	// Advance HeadSHA to sha-2 -> stale SHA automatically invalidates to needs_review!
	snap2 := PRSnapshot{Identity: id, State: StateOpen, Draft: false, HeadSHA: "sha-2"}
	rec, _ = planner.Evaluate(snap2)
	if rec.Status != ReviewNeedsReview {
		t.Fatalf("expected needs_review after HeadSHA advanced to sha-2, got %+v", rec)
	}
}

func TestControllerCheckRunBindingAndStaleHeadActionRequired(t *testing.T) {
	// Matching HeadSHA preserves requested conclusion and binds all four identifiers.
	cr, err := BuildControllerCheckRun(ControllerCheckRunInput{
		PRNodeID:              "PR_kwDOxyz",
		SignedHeadSHA:         "sha-signed",
		CurrentHeadSHA:        "sha-signed",
		ReleaseManifestDigest: "rel-digest-1",
		DecisionDigest:        "dec-digest-1",
		RequestedConclusion:   "success",
	})
	if err != nil {
		t.Fatalf("BuildControllerCheckRun failed: %v", err)
	}
	if cr.Conclusion != "success" || cr.StaleHead || cr.ExternalID == "" {
		t.Fatalf("unexpected CheckRun: %+v", cr)
	}

	// Advanced CurrentHeadSHA forces action_required even if RequestedConclusion was success.
	staleCR, err := BuildControllerCheckRun(ControllerCheckRunInput{
		PRNodeID:              "PR_kwDOxyz",
		SignedHeadSHA:         "sha-signed",
		CurrentHeadSHA:        "sha-new-commit",
		ReleaseManifestDigest: "rel-digest-1",
		DecisionDigest:        "dec-digest-1",
		RequestedConclusion:   "success",
	})
	if err != nil {
		t.Fatalf("BuildControllerCheckRun stale failed: %v", err)
	}
	if !staleCR.StaleHead || staleCR.Conclusion != "action_required" || staleCR.HeadSHA != "sha-new-commit" {
		t.Fatalf("expected stale CheckRun to mark action_required on new SHA, got %+v", staleCR)
	}

	// Missing binding digest must error.
	if _, err := BuildControllerCheckRun(ControllerCheckRunInput{
		PRNodeID:      "PR_kwDOxyz",
		SignedHeadSHA: "sha-signed",
	}); !errors.Is(err, ErrInvalidCheckRun) {
		t.Fatalf("expected ErrInvalidCheckRun for missing digests, got %v", err)
	}
}
