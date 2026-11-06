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
| T-12 | Codex r2 1: the package list and the board show only the caller's organization's work. | API `person-verification.test.ts` "lists only the caller's organization's packages"; `features/board/board.test.tsx` not-found view | implemented and tested |
| T-13 | Codex r2 2: after a drop the stream reads live only once the packages and office reads have succeeded again. | `lib/live.test.tsx` delayed and failed refresh | implemented and tested |
| T-14 | Codex r2 3: a failed verification refresh is unknown at every entry point, so no Accept. | `components/components.test.tsx`, `features/board/board.test.tsx`, `features/office/agent-card.test.tsx` | implemented and tested |
| T-15 | Codex r2 4: the office card's step uses the verification read; never Needs signature for unverified work. | `features/office/agent-card.test.tsx` | implemented and tested |
| T-16 | Codex r2 5: no counts shown as facts before a successful read of the work. | `features/board/board.test.tsx` | implemented and tested |
| T-17 | Codex r3 1: Accept rechecks person verifications at submit; a refresh in flight is unknown for offering Accept. | `components/components.test.tsx` in-flight refresh and submit recheck | implemented and tested (screen-only until D-4) |
| T-18 | Codex r3 2: board reads older than the latest stream drop read as last known, including reads inactive at the drop. | `features/board/board.test.tsx` leave, drop, reconnect, return | implemented and tested |
| T-19 | Codex r3 3: each count's confidence comes from every read it needs. | `features/board/board.test.tsx` one failed package view | implemented and tested |
| T-20 | Review bots A: the office, inbox and office figures read only the caller's organization's work. | API `person-verification.test.ts` "keeps another organization's package out of the office, the inbox and the office figures" | implemented and tested |
| T-21 | Review bots B: recovery after a drop waits for the required reads to settle, even when a second invalidation replaces a refetch. | `lib/live.test.tsx` second refresh during recovery | implemented and tested |
| T-22 | Review bots C: a card whose view or actions read is refetching shows its next step as last known. | `features/board/board.test.tsx` refetching actions | implemented and tested |
| T-23 | Review bots D: cold-load counts stay unknown until every view and actions read completes; a verification refetch in flight offers no Accept (board, office card). | `features/board/board.test.tsx`, `features/office/agent-card.test.tsx` | tested (behavior already present) |
| T-24 | Ruling on flicker: a card and the needs-you count read last known only after a view or actions refetch has been in flight over 1 s; a failed refetch shows at once; no grace for the acceptance gate. | `features/board/board.test.tsx` 300 ms and 1.5 s refetch with fake timers, failed refetch | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Rulings: [m1-rulings](m1-rulings.md).

## Exit criteria

Slice M1 is implemented in PR #65 with its tests and evidence retained in this packet, the review findings and controller rulings 1 to 18 are addressed, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned) or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
