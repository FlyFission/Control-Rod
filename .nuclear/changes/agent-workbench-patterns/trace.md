# Trace: agent workbench pattern note

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| AW-05 The pattern note gives a decision and gate for AW1 to AW19 in our own words. | `docs/patterns/agent-workbenches.md`; `docs/patterns/README.md` | six-word overlap check (E-03) | written; owner review open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 ship in #159 under its own record (`board-attention`). Before merge, a person who did not write the note checks it against its sources for copied wording, and the result is recorded in [ship](ship.md). No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
