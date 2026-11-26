# Ship: The checker is told a checkout card's patch is the whole change

Release decision: **merge on green** under the owner's standing permission (2026-11-25, through 2026-12-02).

- Rollback: revert the merge. No migration.
- Monitoring after merge: sandbox card checks no longer come back inconclusive on "no other files change".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

For a card on a repository checkout whose author delivered exactly one patch, the pre-check brief has a "The whole change" section: the pull request is built from the bound commit plus that patch only, and it lists the files the patch touches. API tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
