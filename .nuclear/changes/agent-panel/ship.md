# Ship: agent panel (click-to-talk slice S1)

Release decision: **proposed merge after review; the owner retains the merge decision.**

- **Proposed:** merge slice S1 from `claude/project-thread-j4bu3j`.
- **Not claimed:** that anyone can talk to an agent (later slices); Firefox or WebKit behavior (Chromium only here); usability with real users.
- **Owner decisions requested:** approve or return the branch.

Rollback: revert the merge. No API, schema or wire change; no stored data is touched.

Monitoring after merge: when Exploration sessions land (slices S2 to S4), the same panel gains an input line for them only; watch that controlled runs never get one.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Slice S1 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the agent panel open, and the owner has made the merge decision. Nothing here claims that any agent can be talked to: controlled runs stay one prompt (ADR 0020), and the panel says so. No session, message channel or Exploration is added.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
