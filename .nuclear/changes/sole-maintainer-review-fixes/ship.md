# Ship: answer the review of the sole-maintainer rule

Release decision: **draft pull request for the owner's yes; no merge or release is authorized by this record.**

- **Proposed:** merge to `main` on the owner's yes, which also confirms the `.github/` template and CODEOWNERS edits #97 made.
- **Not claimed:** an independent review.

## Signature

| Field | Entry |
|---|---|
| Decision | not yet given |
| Question | not yet asked |
| Answer | not yet given |
| Given | not yet given |
| Recorded by | not yet recorded |

## Rollback and monitoring

Rollback: revert the merge. Monitoring: any trust-surface merge whose `Signature` table does not quote a question naming each trust surface it changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-04 are met: ADR 0024 records the decision and ADR 0001 points to it, the trust-surface lists match CODEOWNERS, condition 1 names each trust surface, and the screenshot and sign-off records carry their signatures and real CI evidence; CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
