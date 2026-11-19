# Ship: sole-maintainer sign-off for trust surfaces

Release decision: **draft pull request for the owner's yes; no merge or release is authorized by this record.**

- **Proposed:** merge to `main` on the owner's yes. Once merged, the owner's recorded yes can sign the open draft #92 (CI job timeouts) under the new section.
- **Not claimed:** that this replaces an independent review; the rule exists because none is available.
- **Left as they are:** `policies/README.md` and ADR 0001 still state the default rule. `policies/` is a trust surface and ADR 0001 is an accepted record that changes only by a new ADR, so neither is edited here; the rule in `docs/collaboration.md` governs.
- **Not changed:** branch protection, required reviews or any other repository setting; GitHub will still show no approving review from a second account.

## Signature

| Field | Entry |
|---|---|
| Decision | not yet given |
| Question | not yet asked |
| Answer | not yet given |
| Given | not yet given |
| Recorded by | not yet recorded |

This change creates the sole-maintainer rule, so its own sign-off is the owner's yes to merge it, recorded here by the implementing agent as `docs/collaboration.md` says, with no signature or initials typed for the owner.

## Rollback and monitoring

Rollback: revert the merge. Monitoring: any `Signature` table filled under the sole-maintainer rule without a quoted question and answer, and CODEOWNERS gaining a second maintainer (the exception then lapses).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RS-01 to RS-03 are met: the sole-maintainer rule and its five conditions are in `AGENTS.md` and `docs/collaboration.md`, no template or CODEOWNERS line contradicts it, the screenshot record shows both owner approvals, and CI is green on this change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
