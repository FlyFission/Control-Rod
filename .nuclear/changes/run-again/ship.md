# Ship: A failed run says what happened and offers Run again

Release decision: **approved by the owner, 2026-11-25 00:37 UTC.**

## Signature

Owner (sole maintainer): Ben Huffer, yes, by decision card "Merge PR 193 (Run again on failed runs, first-run guide) into main?" in the project thread, 2026-11-25 00:37 UTC. Blind checks: Codex (two rounds on the owner's Mac, findings fixed as recorded in verification.md) and the Codex GitHub review of 2015a9e (no findings).

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: a card whose check fails reads "The check could not finish. Run it again" with the error under it, and Run again queues a new check.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A card whose newest author or pre-check run failed, was stopped or was lost says so in plain words, shows the runner's error, and offers one button: Run again, or Open run log when the outcome is unknown. It no longer reads "Needs you: Return for revision" for a check that never ran. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
