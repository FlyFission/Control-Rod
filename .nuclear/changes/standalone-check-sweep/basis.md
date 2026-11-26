# Basis: The app's daemon leaves a running controlrod check alone

On the owner's Mac on 2026-11-25 at 23:55:52Z, the app's daemon logged "stopping a run left by an earlier daemon" for run chk-1795650937800156000, then "completion refused: HTTP 404 No such run". That run was a real `go test` check (RunCheck) running alongside the app. RunCheck writes spawn receipts to the same home, so the sweep took it for an orphan. A `controlrod check` run while the app is up could be killed mid-check.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's orphan sweep never stops or reports a run RunCheck made (id chk-...). It removes that run's receipt only once its process has gone. Other orphans are handled as before. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
