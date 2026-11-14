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

Out of scope: `kernel/` decision functions, `policies/`, `tests/redteam/`, `.github/workflows/`, `daemon/internal/runner`, and any spec major version. The kernel still receives the governing pre-check outcome. It does not grow a new action for the sticky rule. That would be a protected kernel change; this milestone enforces the rule in the server before a check is queued, and when it chooses which recorded outcome still stands.

## Fixed inputs

The current pre-check path (`finishPreCheck`, `VerificationRecord`, the independence override's passkey ceremony) and the deliverable digest already stored on a verification (`name` and `sha256` of the author outputs, in name order). Timeout text is the daemon's existing `timeout` error. Quota, rate-limit and cancelled text are classified from the completion error the daemon already sends.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| A fail sticks to the digest of the author deliverables, across rounds of one package, until those bytes change. | The verification record already digests the deliverables that way. | A check that is given a different byte set than that digest. |
| One signed override pays for one later check, using the same passkey ceremony as the independence override. | `OwnerOverride` and `assertionOptions` / `assertionVerify`. | A second check starting on the same override. |
| Timeout, error, quota and cancelled attempts count as inconclusive. | The milestone text. A checker verdict of pass, fail or inconclusive stands only when the run succeeded and the verification was admitted. | A completion path that records one of those four as pass. |
| The kernel does not need a new action for this milestone. | The server refuses the queue, and the outcome it passes to `decide` stays the last pass or fail. An inconclusive attempt does not replace it. | A path that admits a pre-check without `queueRun`, or a decision that reads a verification row the server no longer treats as governing. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
