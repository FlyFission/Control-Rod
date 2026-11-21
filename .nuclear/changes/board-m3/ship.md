# Ship: board redesign slice M3, act from the card

Release decision: **proposed merge after review; the owner retains the merge decision.**

- **Proposed:** merge slice M3 from `claude/project-thread-hqvd67` as a draft pull request.
- **Not claimed:** that the kernel enforces person verification (D-4 is unsigned; the card's Accept block is a screen rule and other API clients can still accept); an axe scan of the open menu (the board axe spec was not extended or run for this slice); Firefox or WebKit behavior; usability with real users.
- **Owner decisions requested:** approve or return the branch.

Rollback: revert the merge. No API, schema or wire change; no stored data is touched.

Monitoring after merge: watch that a card never offers a decision while the board says its status is unknown, and that the card's Accept and its next line always agree.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M3 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned; the Accept block on Safety and Material work is a screen rule), that the board axe scan covers the open menu (not run for this slice), or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
