# Plan: The app's daemon leaves a running controlrod check alone

1. `standaloneCheckRun` (id prefix `chk-`, as RunCheck makes them). In `sweepOrphans`, such a receipt is skipped while its process lives and removed once it is gone. It is never stopped or reported.
2. Test `TestTheSweepLeavesAStandaloneCheckAlone` (Linux): the live check keeps running and keeps its receipt, the dead one's receipt is removed, and nothing is reported. It fails without the change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's orphan sweep never stops or reports a run RunCheck made (id chk-...). It removes that run's receipt only once its process has gone. Other orphans are handled as before. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
