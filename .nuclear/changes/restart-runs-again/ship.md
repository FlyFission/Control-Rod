# Ship: A run Control Rod stopped to restart runs again on its own

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread 2026-11-25 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. No trust surface is touched.

- Rollback: revert the merge. No data, route or migration change.
- Monitoring after merge: after the next `controlrod update`, a run stopped by the restart comes back on its own.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Under a signed policy that releases cards on its own, an author or check run that the daemon stopped because it was shutting down (an update or restart) is settled and queued again by the policy, every time, with the reason recorded; an author run that failed for any other reason still stops for the person. Column picks are followed for routine cards (test). A not-yet-assigned run's icon says the first free agent takes it. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
