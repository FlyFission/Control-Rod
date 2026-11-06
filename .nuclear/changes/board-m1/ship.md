# Ship: board redesign slice M1

Release decision: **proposed merge of PR #65 after review; the owner retains the merge decision.**

- **Proposed:** merge PR #65 (branch `board-m1`, stacked on `board-redesign-spec` per ruling 1) once its review is complete.
- **Not claimed:** that the kernel enforces person verification before acceptance (D-4 is unsigned; the acceptance rule is screen-only); that the O6 line accounts for licence currency; WebKit behavior (not run); accessibility beyond the axe scans in Chromium and Firefox; usability or trust with real users (owner validation after M7 is open in the design record).
- **Owner decisions requested:** approve or return PR #65.

Rollback: revert the merge. The spec change is additive (`covers_current_subject`, `originators`, `PersonVerificationEntry`); no stored data is migrated.

Monitoring after merge: M2 to M8 build on the "M1 as built" interfaces; watch for any entry point that offers Accept without `blockUnverifiedAccept`, and for D-4 being signed, which moves the rule into the kernel.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Rulings: [m1-rulings](m1-rulings.md).

## Exit criteria

Slice M1 is implemented in PR #65 with its tests and evidence retained in this packet, the review findings and controller rulings 1 to 18 are addressed, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned) or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
