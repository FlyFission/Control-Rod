# Ship: Claude checks are not cut off by a turn cap

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread 2026-11-25 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. No trust surface is touched.

- Rollback: revert the merge. No data, route or migration change.
- Monitoring after merge: after the next `controlrod update`, Claude card checks end with a verdict.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Claude checker is no longer cut off by a turn cap before it writes its verdict: the launch passes no --max-turns, and the check deadline bounds the run. A launch test pins it, the launch goldens are regenerated, docs/daemon.md says so, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
