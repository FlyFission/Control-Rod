# Trace: answer the review of the sole-maintainer rule

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| RS-01 The sole-maintainer rule is recorded as an ADR, and ADR 0001 points to it (review point 2). | `docs/adr/0025-sole-maintainer-sign-off.md`; ADR 0001 header | `evidence/fixes-diff.patch` | implemented |
| RS-02 The trust-surface lists in `AGENTS.md`, `CONTRIBUTING.md` and both templates include all of `.github/` and `docs/adr/` (point 5). | Those four files | `evidence/fixes-diff.patch` | implemented |
| RS-03 Condition 1 asks for a question naming each trust surface (point 3). | `docs/collaboration.md` | `evidence/fixes-diff.patch` | implemented |
| RS-04 The screenshot record's `Signature` table holds both approvals, and the sign-off record cites real CI runs and the limit of its question (points 1 and 4). | `readme-shots-lockdown/*.md`; `sole-maintainer-signoff/verification.md` and `ship.md` | `evidence/validate.log` | implemented |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-04 are met: ADR 0025 records the decision and ADR 0001 points to it, the trust-surface lists match CODEOWNERS, condition 1 names each trust surface, and the screenshot and sign-off records carry their signatures and real CI evidence; CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
