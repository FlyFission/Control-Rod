# Ship: Claude checks on a Mac write their verdict (file tools, no nested sandbox)

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread 2026-11-25 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. No trust surface is touched.

- Rollback: revert the merge. No data, route or migration change.
- Monitoring after merge: after the next `controlrod update`, Claude checks on a Mac end with a verdict.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker writes its verdict with its file tools and is never offered a Bash tool that cannot start: the Seatbelt profile allows only the <verdict>.tmp.<pid>.<hex> sibling that Claude Code replaces a file through, and the macOS Claude checker launch drops Bash because Seatbelt cannot nest. Unit and darwin tests pin both, and a real Claude check on the owner Mac ends with a verdict.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
