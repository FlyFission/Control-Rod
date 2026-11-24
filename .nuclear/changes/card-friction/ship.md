# Ship: Fewer steps on a new card

Release decision: **pending the owner's yes.**

## Signature

Owner (sole maintainer): pending.

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: on a real install, a card added with quick add shows its lane chip and goes straight to intake; a card that still asks to classify means the sender lacks lane authority or the project has no lane.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Adding a card is one step: it takes the project's default data lane with no Classify step; the project bar sets that default; a card's drawer says what its lane means and can raise it; a card in work no longer reads "Needs you: Return for revision" when nothing is asked; web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
