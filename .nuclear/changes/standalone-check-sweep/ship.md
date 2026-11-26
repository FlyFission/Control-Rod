# Ship: The app's daemon leaves a running controlrod check alone

Release decision: **merge on green** under the owner's standing permission (2026-11-25, through 2026-12-02).

- Rollback: revert the merge. No migration.
- Monitoring after merge: no "stopping a run left by an earlier daemon" for a chk- run in ~/.controlrod/logs/controlrod.log.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's orphan sweep never stops or reports a run RunCheck made (id chk-...). It removes that run's receipt only once its process has gone. Other orphans are handled as before. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
