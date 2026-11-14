# Ship: checker attempts and sticky fails

Release decision: **pull request for owner review. This record does not authorize a merge.**

- **Proposed:** merge to `main` after review. The spec change is additive inside API 0.1: `CheckerAttempt`, `CheckBlocked`, `RecheckOverride`, the attempt list, the check request, and the recheck override. Existing record `schema_version` values are unchanged. Optional fields were added to `PackageView`.
- **Not claimed:** the kernel refuses a sticky re-check by itself. The server refuses the queue and keeps the last pass or fail as the outcome `decide` sees. Putting that floor in the kernel would be a protected change and was not done.
- **Not claimed:** `daemon/internal/runner` was not changed. Timeout, quota and cancellation are classified from the completion error the daemon already sends (`timeout`, and text containing quota, rate limit, or cancel). A stop is cancelled.
- **Owner decision requested:** whether the sticky rule should later move into the kernel, so a caller that bypasses `queueRun` cannot admit a check the server would have refused.

Rollback: revert the commit. Migrations `020-checker-attempts` and `021-checker-queued-digests` create append-only tables. Reversing them drops those tables and leaves earlier records in place. A control plane that still expects the new routes cannot serve them after rollback.

Monitoring after merge: package views whose `check_blocked.code` is `sticky-fail`, and `package.checker-attempt` events whose outcome is `timeout`, `error`, `quota` or `cancelled`. A burst of `sticky-fail` on digests the author has just changed means the captured digest and the governing lookup disagree.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
