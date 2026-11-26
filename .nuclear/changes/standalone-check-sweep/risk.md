# Risk: The app's daemon leaves a running controlrod check alone

- **A crashed `controlrod check` leaves its agent running.** The daemon no longer stops it. That process is the person's own command, not a board run, and it ends at its own timeout (15 minutes by default).
- **Spoofing.** A board run's id comes from the control plane (UUIDs), never `chk-`.
- **No trust surface is touched.**

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; no kernel, policy, spec or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The daemon's orphan sweep never stops or reports a run RunCheck made (id chk-...). It removes that run's receipt only once its process has gone. Other orphans are handled as before. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
