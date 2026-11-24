# Ship: A guided first run on the board

Release decision: **pending the owner's yes.**

## Signature

Owner (sole maintainer): pending.

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: a fresh install opens on the board with the guide at 0 of 5 and "Choose agents"; after Setup it moves to "Connect a repository".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new person on the board sees five steps from choosing agents to an accepted change, each ticked from real state, with one primary button for the next step only; the guide closes when a change is accepted or the person hides it. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
