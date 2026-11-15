# Plan: checker attempts and sticky fails

1. Add additive spec models: `CheckerAttempt`, `CheckBlocked`, `RecheckOverride`, and package routes for the attempt list, a check request, and the two-step recheck override. Regenerate `spec/generated`. Do not bump `schema_version` on existing records.
2. Migration `020-checker-attempts`: append-only `checker_attempts`, `checker_recheck_overrides` and `checker_recheck_uses`. Migration `021-checker-queued-digests` pins the digest at queue time. It is a separate migration because `020` was already checksum-locked. Migration `022-checker-no-truncate` adds `TRUNCATE` triggers; row triggers do not fire on truncate.
3. Record one attempt whenever a pre-check reaches a terminal state (succeeded, failed, stopped, lost, or a refused completion). Classify timeout, quota, cancellation and other failures as inconclusive. Admit a pass, fail or inconclusive verdict only from a succeeded run.
4. Refuse a new pre-check when that deliverable digest already has a governing fail, unless an unused signed override will pay for that one check. Spend the override only in the claim transaction, after the budget check has passed and the run is running. Admission requires that use row already. Startup reconciliation does not spend an override. A pass is admitted over a fail only when that run has a `checker_recheck_uses` row. An overridden pass clears the fail for later revisions of the same bytes, but that earlier verification is not the new revision's pre-check. The automatic queue after an unchanged author revision records the refusal instead of rolling the author completion back.
5. The governing outcome is the latest decisive pass or fail. Fails stick across revisions. A reusable pass counts only for the current revision, so a return that changes the acceptance criteria and writes the same files does not reuse the old pass. A later inconclusive attempt, including one that exists only as a legacy verification, does not replace a decisive result. `currentCriterionResults(q, pkg, verification, lockEvidence)` no longer takes a round. It selects `preparation_criterion_results` by `verification_digest`, the digest of that verification, so an inconclusive recheck does not throw `criterion-results-corrupt`.
6. Show the attempt list, the recorded overrides and the sticky refusal on the package page and the case view.
7. Tests for the five acceptance cases, then the API suite, the web suite and typecheck.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
