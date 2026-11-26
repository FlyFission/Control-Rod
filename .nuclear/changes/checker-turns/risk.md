# Risk: Claude checks are not cut off by a turn cap

- A checker can take more turns, and so more tokens, inside its deadline. It stays read-only and sandboxed.
- The launch qualification keeps its own bound for its fixture run. It is not the daemon's launch.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Claude checker is no longer cut off by a turn cap before it writes its verdict: the launch passes no --max-turns, and the check deadline bounds the run. A launch test pins it, the launch goldens are regenerated, docs/daemon.md says so, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
