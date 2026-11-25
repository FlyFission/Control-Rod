# Ship: SCRAM that signs, one way to close, true compact, a readable run log

Release decision: **approved by the owner, 2026-11-25 03:41 UTC.**

## Signature

Owner (sole maintainer): Ben Huffer, yes, by decision card "Merge PR 199 (SCRAM, close X, compact cards, full log) once Codex is clean?" in the project thread, 2026-11-25 03:41 UTC. Blind check: Codex GitHub review of 714f87e, no findings.

- Rollback: revert the merge. No data, route or migration.
- Monitoring: the live drawer and SCRAM dialog tests run with the live suites; the owner's next SCRAM and next stuck run are the field checks.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SCRAM can be signed at once from the active project, and when its button is closed the dialog says why in one line. Every drawer, dialog and panel has the same close X in its top-right corner, Esc closes, and a click outside closes unless typed text would be lost. Compact cards are one line: a status mark and the name. The run log opens at full size with the plain summary first. Web tests, typecheck and the live drawer, SCRAM dialog and lifecycle tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
