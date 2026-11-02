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

## Round 2 (verdict BLOCK; S3-01, S3-05, S3-06, S3-07 and the timing Medium closed)

| ID | Disposition | Fix and proof |
|---|---|---|
| S3-08 | Accepted, fixed | One lock order everywhere: the marking lock (taken by the executor), then the organization's administration lock, then the SCRAM gate, then rows. A release now takes the gate after `lockSigner`; pulls, reviews and restarts take it after the administration lock `runAdmin` holds; claims, requeues, completions and sweeps take no administration lock. |
| S3-09 | Accepted, fixed | A review's signed payload names the newest batch the person saw (`covers_batch`); the server refuses it (`quarantine-changed`) if that is not the newest batch now, so coverage never stretches over unseen output. `GET /scrams/:id` (contract in `spec/api.tsp`) shows the stopped runs, every batch with its digests, reviews and restarts, scoped to the caller's organization. Tests: `refuses a review signed before the run reported more`, `shows a SCRAM only to its own organization`; every other test reviews through the read view. |
| S3-10 | Accepted, fixed | The lost-run sweep and the restart evidence path enter the SCRAM gate before any row lock, so no unknown outcome can land between a restart's eligibility check and its commit. |
| S3-11 | Accepted, fixed | A completion from any run whose work a SCRAM holds is refused as `scram-quarantined`; recording it, or a late completion, adopts the run into every SCRAM holding it (`adoptHeldRun`, `scram_runs`), quarantines the report as a batch, and so requires a review before a restart. Test: `quarantines a late report from a run lost before the pull, and holds the restart for its review`. |
| S3-12 | Accepted, fixed | The daemon keeps a lease clock from the claim: the earlier of the control plane's advertised `lease_expires_at` and three heartbeats after the request was sent (never the reply's arrival). A watchdog stops the run when it ends, through preparation and launch; nothing starts once it has ended; each heartbeat is bounded by it; renewals only extend it. Tests: `TestTheLeaseEndsAtTheEarlierOfTheAdvertisedEndAndThreeHeartbeatsFromSending`, `TestTheAdvertisedLeaseIsHonouredEvenBetweenHeartbeats` (a 400 ms lease with 30 s heartbeats stops the run in about half a second). |
| Medium: run tenancy | Fixed | `scram_runs` carries a foreign key to `object_owners(object_kind, object_id, org_id)`, so a run can only be associated with a SCRAM of its own organization. |
| Medium: final flush | Fixed | Heartbeat requests are derived from the flush loop's context, so stopping the loop abandons one in flight (its batch goes back) and the bounded final flush starts at once. |

Verification after round 2 fixes: daemon `go vet` on linux, darwin and windows and `go test ./...` with no runtimes on PATH; API 494 passed, 1 skipped; web 105 passed.

## Round 3 (verdict BLOCK; S3-08, S3-09, S3-10 and both Mediums closed)

| ID | Disposition | Fix and proof |
|---|---|---|
| S3-13 (and S3-12) | Accepted, fixed | The start gate (`ExecHooks.BeforeStart`, run immediately before `cmd.Start`) now refuses when the run was cancelled for any reason or its lease has ended, before checking the runtime's guard; nothing is spawned. Test: `TestNothingStartsWhenTheStartGateRefuses`. |
| S3-14 (and S3-11) | Accepted, fixed | Reports that are never applied (refused or late completions) are associated with every active SCRAM whose scope reaches the run, including work a partial restart resumed (`adoptHeldRun` with `evenLifted`), and quarantined as batches; only a SCRAM that still holds the work marks the run stopped and turns the refusal into `scram-quarantined`. A broader restart therefore waits for their review. Test: `holds a broader restart for late output from work a partial restart resumed`. |
| S3-15 | Accepted, fixed | When `recordRefused` finds the run already lost, it hands the report to the late path (`retainLate`, factored out of `complete`), which retains it with its digests, adopts and quarantines it under SCRAM, and settles the outcome if the run is proven ended, before answering `run-lost`. Reached only through a concurrent sweep between the two transactions; covered by construction (the late path itself is tested). |

Verification after round 3 fixes: daemon `go vet` on linux, darwin and windows and `go test ./...` with no runtimes on PATH; API 495 passed, 1 skipped.
