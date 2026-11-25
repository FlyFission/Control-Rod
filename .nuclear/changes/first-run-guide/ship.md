# Ship: A guided first run on the board

Release decision: **approved by the owner, 2026-11-25 00:37 UTC.**

## Signature

Owner (sole maintainer): Ben Huffer, yes, by decision card "Merge PR 193 (Run again on failed runs, first-run guide) into main?" in the project thread, 2026-11-25 00:37 UTC. Blind checks: Codex (two rounds on the owner's Mac, findings fixed as recorded in verification.md) and the Codex GitHub review of 2015a9e (no findings).

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: a fresh install opens on the board with the guide at 0 of 5 and "Choose agents"; after Setup it moves to "Connect a repository".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A new person on the board sees five steps from choosing agents to an accepted change, each ticked from real state, with one primary button for the next step only; the guide closes when a change is accepted or the person hides it. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
