# Ship: Claude checks on a Mac can run commands and write their verdict

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread 2026-11-25 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. No trust surface is touched.

- Rollback: revert the merge. No data, route or migration change.
- Monitoring after merge: after the next `controlrod update`, a Claude check on a Mac runs its commands and writes its verdict.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker can run its read-only Bash commands and write its verdict: the checker environment points CLAUDE_CODE_TMPDIR and TMPDIR at the per-run folder, and the checker prompt says both verdict files already exist and must be read before they are written. A unit test pins the environment, the launch goldens are regenerated, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
