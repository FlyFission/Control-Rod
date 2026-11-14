# Plan: checker attempts and sticky fails

1. Add additive spec models: `CheckerAttempt`, `CheckBlocked`, `RecheckOverride`, and package routes for the attempt list, a check request, and the two-step recheck override. Regenerate `spec/generated`. Do not bump `schema_version` on existing records.
2. Migration `020-checker-attempts`: append-only `checker_attempts`, `checker_recheck_overrides` and `checker_recheck_uses`.
3. Record one attempt whenever a pre-check reaches a terminal state (succeeded, failed, stopped, lost, or a refused completion). Classify timeout, quota, cancellation and other failures as inconclusive. Admit a pass, fail or inconclusive verdict only from a succeeded run.
4. Refuse a new pre-check when that deliverable digest already has a fail, unless an unused signed override is spent on that one check. The automatic queue after an unchanged author revision records the refusal instead of rolling the author completion back.
5. Keep the governing pre-check as the latest pass or fail on the current deliverable. A later inconclusive attempt does not replace it, including while a newer author run is still queued.
6. Show the attempt list, the recorded overrides and the sticky refusal on the package page and the case view.
7. Tests for the five acceptance cases, then the API suite, the web suite and typecheck.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
