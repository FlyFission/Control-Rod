# Basis: checker attempts and sticky fails

**Change slug:** `checker-attempts`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-14
**Decision this basis supports:** whether attempt records and sticky checker fails can merge as milestone 3 of the multi-provider work.

## Mission / need

A pre-check can be run again until it passes, and a timeout, error, quota failure or cancellation on one attempt can hide a fail. Milestone 3 records every checker attempt and makes a fail stick to the deliverable digest. The milestone text is the design input. No separate multi-provider design file is in this tree. This change does not touch the in-flight daemon adapter seam (`daemon/internal/runner`).

## Scope

In scope: an append-only attempt record and a one-check recheck override in `services/api`, additive models in `spec/` (API 0.1, no schema_version bump of existing records), the package and case pages that show the attempt list and the refusal, and this packet.

Out of scope: `kernel/` decision functions, `policies/`, `tests/redteam/`, `.github/workflows/`, `daemon/internal/runner`, and any spec major version. No kernel source file is edited, and the sticky rule is not a new kernel action. `subjectOf` does change what `decide` is given: it passes the governing verification for the current revision and digest, not merely the newest verification row. That is an acceptance-semantics change. The server also re-checks the rule when a run is claimed and when a result is admitted.

## Fixed inputs

The current pre-check path (`finishPreCheck`, `VerificationRecord`, the independence override's passkey ceremony) and the deliverable digest already stored on a verification (`name` and `sha256` of the author outputs, in name order). Timeout text is the daemon's existing `timeout` error. Quota, rate-limit and cancelled text are classified from the completion error the daemon already sends.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| A fail sticks to the digest of the author deliverables, across revisions of one package, until those bytes change. A new package is a new digest scope. Any byte change, or a different package, defeats the stickiness. | The verification record already digests the deliverables that way, per package. | A check that is given a different byte set than that digest, or a fail on one package blocking another. |
| One signed override pays for one later check, using the same passkey ceremony as the independence override. It is spent only after that check is running. | `OwnerOverride` and `assertionOptions` / `assertionVerify`. | A second check starting on the same override, or an override spent by a claim that never started. |
| Timeout, error, quota and cancelled attempts count as inconclusive. | The milestone text. A checker verdict of pass, fail or inconclusive stands only when the run succeeded and the verification was admitted. | A completion path that records one of those four as pass. |
| The kernel does not need a new action for this milestone. | The server refuses the queue, stops a queued or running check at claim and at admission, and the verification passed to `decide` is the governing pass or fail. A pass from another revision does not count. A pass supersedes a fail only when that attempt spent a recheck override. An inconclusive result is not returned when a decisive one exists. | A path that admits a pass with no `checker_recheck_uses` row after a fail, or a decision that reads a newer inconclusive verification instead. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
