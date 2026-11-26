# Trace: The app's daemon leaves a running controlrod check alone

| Need | Change | Evidence |
| --- | --- | --- |
| A live standalone check is not stopped | `standaloneCheckRun` skip in `sweepOrphans` | `TestTheSweepLeavesAStandaloneCheckAlone` |
| Its receipt does not pile up | removed once the process is gone | same test |
| Real orphans still handled | unchanged | `TestRestartedDaemonStopsOrphansReportsThemAndEndsUnreceiptedScopes` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's orphan sweep never stops or reports a run RunCheck made (id chk-...). It removes that run's receipt only once its process has gone. Other orphans are handled as before. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
