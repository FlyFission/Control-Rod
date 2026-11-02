# Phase 2 part 3 (task 2.10, SCRAM): Codex review adjudication

Reviewer: Codex CLI (read-only, ephemeral). Evidence: `scram-codex-round1.md` and later rounds beside it.

## Round 1 (verdict BLOCK)

| ID | Disposition | Fix and proof |
|---|---|---|
| S3-01 | Accepted, fixed | A pull selects only runs its organization owns (joined through `object_owners`), and a SCRAM holds a subject only when the subject's owner is in the SCRAM's organization (and project, for project scope). Test: `never reaches work another organization owns`. |
| S3-02 | Accepted, fixed | A restart checks every run in its scope: any run with an unreconciled unknown outcome blocks it whether or not the SCRAM stopped it, and runs the SCRAM stopped block while running or while a quarantine batch has no covering review. Work legitimately running after an earlier partial restart does not block, by design. Restart holds the SCRAM gate exclusively, so nothing lands between the check and the restart. Test: `blocks a restart on any run in scope with an unknown outcome, not only the ones it stopped`. |
| S3-03 | Accepted, fixed | Quarantine is kept as numbered batches (`scram_quarantine_batches`, one per completion idempotency key). A review records `covers_batch`, the newest batch it saw; a later batch needs a new review (reviews are no longer one per run). Reviews, quarantine writes and restarts all pass the SCRAM gate. Test: `needs a fresh review for anything a stopped run reports after its last review`. |
| S3-04 | Accepted, fixed | The daemon computes its lease end (three heartbeats after the last answer) before every post, stops the run once it has passed, and bounds each heartbeat request by that deadline, so a request left hanging cannot keep the run alive. The final flush after a run ends is bounded (10 s) so an unresponsive control plane cannot hold the completion back. Tests: `TestAHeartbeatLeftHangingCannotKeepARunPastItsLease`, `TestADaemonOutOfContactForALeaseStopsItsRun`. |
| S3-05 | Accepted, fixed | `scram_runs` records every SCRAM that reached a run; a second pull no longer overwrites the first (`Run.scram_id` keeps the first). When a run ends, every SCRAM it belongs to is checked for its time to stop. Test: `records the time to stop for every SCRAM that reached a run, even when pulls overlap`. |
| S3-06 | Accepted, fixed | Every output of a quarantined completion is kept with its digest; the event lists the first 200 digests and the full count. Test: `keeps every output a stopped run reports, however many`. |
| S3-07 | Accepted, fixed | `recordRefused` enters the SCRAM gate and re-reads the locked run: if SCRAM reached it after the refused attempt rolled back, the completion is recorded as `scram-quarantined`, stopped, and quarantined, whatever the earlier refusal was. SCRAM quarantine no longer depends on a preparation head. |
| Medium: tenant foreign keys | Fixed | Migration 015 (unreleased) ties SCRAM runs, reviews and restarts to `scram_events(id, org_id)`, reviewers and releasers to `members(id, org_id)`, and reviews to the SCRAM's own runs. |
| Medium: time to stop | Fixed | Measured from the `scram.pulled` event, written after the gate is won, so lock waits do not count. |

Verification after round 1 fixes: daemon `go vet` on linux, darwin and windows and `go test ./...` with no runtimes on PATH; API 490 passed, 1 skipped.
