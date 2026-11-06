# Trace: board redesign slice M1

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | M1 Board home (Tasks 1 to 4): kind, meaning tokens and three looks with a contrast script; read route for person verifications; Person verifies column and the card next line; the board at `/` with the honest status banner and visible meaning words. | `lib/kind.test.ts`, `design/contrast.test.ts`, `lib/board.test.ts`, `lib/next.test.ts`, `features/board/board.test.tsx`, `lib/live.test.tsx`, API `person-verification.test.ts`, `e2e/board-looks.spec.ts` | implemented and tested |
| T-02 | Stream resume, stall detection and refresh after a drop (findings 1, 2). | `lib/live.test.tsx` | implemented and tested |
| T-03 | No stale state shown as current: counts "Last known", cards "Status unknown since <time>" (finding 3, ruling 13). | `features/board/board.test.tsx`, `e2e/board-looks.spec.ts` | implemented and tested |
| T-04 | Looks on the board only; `--line` checked (finding 4, ruling 10). | `places/places.test.tsx`, `features/board/board.test.tsx`, `design/contrast.test.ts`, `e2e/board-looks.spec.ts` | implemented and tested |
| T-05 | Unread verifications keep a card in Person verifies (finding 5, ruling 11). | `features/board/board.test.tsx` | implemented and tested |
| T-06 | Verifier rules and the O6 line for every viewer (finding 6, ruling 12). | `lib/next.test.ts`, `features/board/board.test.tsx` | implemented and tested |
| T-07 | One acceptance rule in every entry point (findings A and D, ruling 16). | `lib/next.test.ts`, `features/board/board.test.tsx`, `components/components.test.tsx`, `features/case/case.test.tsx`, `pages/package-accept.test.tsx`, `places/places.test.tsx`, `features/office/agent-card.test.tsx` | implemented and tested (screen-only until D-4) |
| T-08 | Only a pass covering the current work counts (finding E, ruling 18). | API `person-verification.test.ts`, `lib/board.test.ts`, `components/components.test.tsx` | implemented and tested |
| T-09 | Failed reads are said, not shown as empty or pending (finding B, must-fix minors). | `features/board/board.test.tsx` | implemented and tested |
| T-10 | `GET /packages/:id` gated by organization (ruling 14). | API `person-verification.test.ts` | implemented and tested |
| T-11 | Interfaces as built and rulings committed (finding 7, rulings 15, 17). | Review of `docs/superpowers/plans/2026-11-06-board-redesign.md` and `m1-rulings.md` | done |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Rulings: [m1-rulings](m1-rulings.md).

## Exit criteria

Slice M1 is implemented in PR #65 with its tests and evidence retained in this packet, the review findings and controller rulings 1 to 18 are addressed, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned) or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
