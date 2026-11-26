# Plan: A run Control Rod stopped to restart runs again on its own

1. Reproduce from the Mac's run records (R-874b210a failed "daemon shutdown", no retry).
2. Test first (signing-policy), then widen the retry.
3. API and web tests, both typechecks; PR, merge on green.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Under a signed policy that releases cards on its own, an author or check run that the daemon stopped because it was shutting down (an update or restart) is settled and queued again by the policy, every time, with the reason recorded; an author run that failed for any other reason still stops for the person. Column picks are followed for routine cards (test). A not-yet-assigned run's icon says the first free agent takes it. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
