# Ship: board redesign slice M2, lenses

Release decision: **proposed merge after review; the owner retains the merge decision.**

- **Proposed:** merge slice M2 from `feat/board-m2-lenses`.
- **Not claimed:** server-side persistence of saved views across devices (deferred beyond MVP; uses browser `localStorage` under `cr.views.<user>`); Firefox or WebKit execution of `board-looks.spec.ts` (Chromium only here); usability validation with real users.
- **Owner decisions requested:** approve or return the branch.

Rollback: revert the merge. No API, schema, database, kernel, policy, or wire change; browser `localStorage` keys `cr.views.<user>` are inert if unused.

Monitoring after merge: confirm that no filter or saved view hides `person-verifies` or `needs-signature` cards without showing the guard banner and `Show` control, and that `edgeColor` never uses meaning tokens.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m3](../board-m3/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M2 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims cross-device persistence of saved views, Firefox or WebKit behavior beyond Chromium, or validation with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
