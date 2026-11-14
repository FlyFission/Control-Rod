# Ship: checker attempts and sticky fails

Release decision: **pull request for owner review. This record does not authorize a merge.**

- **Proposed:** merge to `main` after review. The spec change is additive inside API 0.1: `CheckerAttempt`, `CheckBlocked`, `RecheckOverride`, the attempt list, the check request, and the recheck override. Existing record `schema_version` values are unchanged. Optional fields were added to `PackageView`.
- **Not claimed:** no kernel source file is edited, and the sticky rule is not a new kernel action. `subjectOf` now chooses the governing verification and passes that to `decide`. A pass from an earlier revision is not that verification. A fail still is. That changes what acceptance sees. Putting the floor inside the kernel would be a protected change and was not done.
- **Not claimed:** `daemon/internal/runner` was not changed. Timeout, quota and cancellation are classified from the completion error the daemon already sends (`timeout`, and text containing quota, rate limit, or cancel). A stop is cancelled.
- **Owner decision requested:** whether the sticky rule should later move into the kernel, so a caller that bypasses `queueRun` cannot admit a check the server would have refused.

Rollback: revert the commit. Migration `020-checker-attempts` creates the append-only attempt, override and use tables. The plan named that migration `020`. Migration `021-checker-queued-digests` was added after `020` was checksum-locked, to pin the digest a check was queued against. Migration `022-checker-no-truncate` adds statement triggers so `TRUNCATE` is refused; it creates no table. Reversing them drops the triggers and the tables and leaves earlier records in place. A control plane that still expects the new routes cannot serve them after rollback. Any change to the deliverable bytes, or a new package, defeats stickiness. The same bytes on a new revision do not reuse an old pass.

Monitoring after merge: package views whose `check_blocked.code` is `sticky-fail`, and `package.checker-attempt` events whose outcome is `timeout`, `error`, `quota` or `cancelled`. A burst of `sticky-fail` on digests the author has just changed means the captured digest and the governing lookup disagree.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every checker attempt is stored append-only and listed in order. A re-run on a failed digest is refused with a reason unless the deliverable changed or the owner signed an override, and that override is recorded. A timeout after a fail stays inconclusive, leaves the fail in place, and is not a pass. Existing tests, typecheck and the web suite pass. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
