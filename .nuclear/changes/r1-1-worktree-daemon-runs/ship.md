# Ship: worktree daemon binding

**Decision:** Draft only. [Verification](verification.md) records the author checks and the overseer's macOS suite results. The corrected API dispatch test and full API suite still need a rerun outside the author sandbox with PostgreSQL 17. The independent checker verdict, Ben's acceptance, and merge are pending.

Additive TypeSpec contracts and generated artifacts require owner CODEOWNERS review at merge. No protected-path preparation signature is claimed by this packet.

## Signature

| Decision | Question | Answer | When and where | Recorded by |
| --- | --- | --- | --- | --- |
| Pending | Pending exact-diff review | Pending | Pending | Author agent |

Rollback: revert the change through review. Bound runs must never fall back to an unbound workspace during a mixed-version upgrade or rollback.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Author evidence, independent different-vendor checker, green required checks, answered review threads and Ben's recorded acceptance precede merge.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
