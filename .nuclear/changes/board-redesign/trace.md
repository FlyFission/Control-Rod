# Trace: board redesign design spec

| Requirement | Slice | Tests (planned) | Disposition |
|---|---|---|---|
| G-1 The board is the home screen; every card says the next thing a person must do, or why it waits. | M1, M3 | Board projection incl. Person verifies; next-line derivation from ActionDescriptor; page test of `/` | designed, not implemented |
| G-2 Adding work is fast: inline title at the top of Ready. | M4 | Inline add, chained Enter, paste many, lane classification page tests | designed, not implemented |
| G-3 A person can follow a run, stop it, review code or documents, return with comments, verify and sign without leaving the card. | M5, M6, M7 | Stop outcome incl. "outcome unknown"; diff comment batching into Return; document comments; verify and accept panels disabled while a check fails | designed, not implemented |
| G-4 Lenses: kind, color by, group by, density, saved views, three looks. | M1, M2 | Lens state in URL; saved views; default-view guard | designed, not implemented |
| G-5 Every claim on screen is something the system recorded. | M1 to M7 | Honest usage lines; attestation per claim; refusal paths with API reason and change; stale stream; ETag conflict | designed, not implemented |
| G-6 Restrained, dense, legible, WCAG 2.2 AA in all three looks. | M1, M8 | axe on board, card view and both review tabs in all three looks; keyboard-only walkthrough | designed (mockup axe clean, E-03), not implemented |
| M1 Board home (Tasks 1 to 4): kind, meaning tokens and three looks with a contrast script; read route for person verifications; Person verifies column and the card next line; the board at `/` with the honest status banner and visible meaning words. | M1 | `lib/kind.test.ts`, `design/contrast.test.ts`, `lib/board.test.ts`, `lib/next.test.ts`, `features/board/board.test.tsx`, `lib/live.test.tsx`, API `person-verification.test.ts` and the package view originators test, `e2e/board-looks.spec.ts` | implemented and tested (M1) |
| A-1 No screen says steered, gated, capped, attested or verified without a record. | M1 to M7 | As G-5 | designed, not implemented |
| A-2 Status is derived, never dragged. | M1, M3 | No drag in the MVP; Move to lists only lawful actions | designed, not implemented |
| A-3 Color is never the only carrier of meaning. | M1, M2, M8 | Word and symbol present for each meaning; axe | designed, not implemented |
| A-4 The default view never hides work waiting on a person verification or signature. | M2 | Default-view guard test | designed, not implemented |
| A-5 No third-party runtime fonts, scripts or assets. | M1, M8 | Review of built output for external hosts | designed, not implemented |
| Parked items (steering, money cap, kernel rules, D-4, solo independent check, evidence export, in-file anchors, multi-repo, calendar, tracker import) | none | none | open: owner decisions (spec section 11) |

Requirement IDs G-1 to G-6 are the spec goals 1 to 6 in order; A-1 to A-5 are its anti-goals in order.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec is complete, its evidence is retained in this packet, and the owner has reviewed it. No product code is part of this change; the board redesign is designed, not implemented, and no screen claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
