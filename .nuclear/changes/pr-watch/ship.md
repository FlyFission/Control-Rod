# Ship: Pull request state on accepted cards

Release decision: **pending**. Merge on green, under the owner's standing merge-on-green permission for this repository, valid to 2026-12-02.

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: on the owner's Mac, an accepted card with a draft pull request shows "Checks running on the pull request", then "Pull request ready for you to merge" or "Checks failing on the pull request", and "Merged" after the merge.
- Limits: the live gh answer shape was not exercised in the cloud container (no GitHub sign-in there). The mapping is tested against gh's documented JSON shape only.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

After Control Rod opens a card's draft pull request, the card's line and the pull request line say whether it is ready to merge, failing its checks, still checking, merged or closed, read live and read-only from GitHub. When GitHub cannot be read, both lines are exactly as before. No text from GitHub is read or shown. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
