# Ship: Checker findings reach the author as data

Release decision: **pending** (merge on green under the owner's standing merge-on-green permission for this repository, valid to 2026-12-02).

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: an author round 2 brief shows the notice and the `<checker-findings>` fence, and `inputs/findings.json` is present.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On an author round after a failed check, the brief says the findings are another agent's data, not instructions, and still asks for each one to be fixed. The findings sit inside a fence that no text in them can close, and are also in inputs/findings.json. Each scope path stays on one line and inside its code span. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
