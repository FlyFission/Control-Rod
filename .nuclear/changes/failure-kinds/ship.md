# Ship: Typed failure reasons and one safe retry for author runs

Release decision: **pending**. Merge on green, under the owner's standing merge-on-green permission for this repository, valid to 2026-12-02.

- Rollback: revert the merge. No data or migration.
- Monitoring after merge: on the owner's Mac, an author run whose agent quits with an error is queued again once, and its reconciliation says "quit with an error". A second quit stops for the owner.
- Limits: on Linux CI the Go runner tests that need bubblewrap, and one egress-filter test that reads the cloud container's own proxy settings, do not pass in the cloud container. They fail the same way on `main` there, so they say nothing about this change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every failed run the daemon can place carries a fixed failure kind, taken from the daemon's own error values. An author run whose agent quit with an error, or that the daemon stopped after losing contact, runs again once on its own under a signing policy that lets cards run. That holds only when the daemon accounted for its processes. Every other failure stops for the person as before. API and Go tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
