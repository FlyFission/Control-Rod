# Plan: agent workbench pattern note

1. Read the public README of Orchestrator.inc, Vibe Kanban and Paradev at pinned commits, Orchestrator.inc's architecture document, and the Claude Code desktop documentation. Compare with the board, Inbox, Today and the gap analysis.
2. Write `docs/patterns/agent-workbenches.md` with a decision and gate for each item, and list it in `docs/patterns/README.md`.
3. AW1 to AW4 are built in #159 under their own record (`board-attention`).
4. Run the script wording pre-check (E-03), then a person's wording check before merge.
5. Owner review. AW5 (Today agrees with the Inbox) and AW7 (collapse old Accepted) are proposed next, each with its own record.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 ship in #159 under its own record (`board-attention`). Before merge, a person who did not write the note checks it against its sources for copied wording, and the result is recorded in [ship](ship.md). No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
