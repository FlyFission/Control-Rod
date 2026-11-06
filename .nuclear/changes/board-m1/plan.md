# Plan: board redesign slice M1

1. Task 1: kind, meaning tokens and three looks, with a contrast script and test.
2. Task 2: read route for a package's person verifications (`PersonVerificationEntry`).
3. Task 3: board columns with Person verifies, and the card next line.
4. Task 4: the card and the board at `/`, with the honest stream status.
5. Whole-branch review and one fix wave: the final review findings, the Codex review findings A to E, and controller rulings 10 to 18 ([m1-rulings](m1-rulings.md)).
6. Evidence: test-first logs (RED and GREEN) per finding, the full web suite, typecheck, API tests, the contrast script and the board axe run, all under `evidence/`.

The task-level plan is `docs/superpowers/plans/2026-11-06-board-redesign.md`; its "M1 as built" section records the interfaces as shipped. M2 to M8 are authorized only by later records.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Rulings: [m1-rulings](m1-rulings.md).

## Exit criteria

Slice M1 is implemented in PR #65 with its tests and evidence retained in this packet, the review findings and controller rulings 1 to 18 are addressed, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned) or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
