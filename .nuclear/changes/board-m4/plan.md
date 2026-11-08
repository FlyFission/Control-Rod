# Plan: board redesign slice M4, quick add

1. `QuickAdd.tsx`: "+ Add a card" and the `c` key open an inline field; Enter posts one capture with no lane and keeps a fresh focused field; Escape closes and returns focus; a draft survives blur; a multi-line paste offers "Add N cards"; a refusal shows in place with the API's words.
2. `CaptureCard.tsx` and `captureLine`: the capture's face at the top of Ready, with the lane picker and Classify inline until classified, "Intake drafting" while intake runs, the error and Retry intake when it failed, lost or stopped.
3. `useBoardData.ts`: read `GET /captures`; `pendingCaptures` keeps unanswered captures with no package ids, newest first; a failed read joins the problems alert with Retry.
4. `BoardView.tsx`: quick add and capture cards in Ready above the package cards; the empty state explains the field and the lane step instead of sending the person elsewhere.
5. Tests: `quick-add.test.tsx` (the plan's Task 8 step 1 list), `board.test.tsx` updated for the new empty state and the captures read, `e2e/board-looks.spec.ts` scanning with the field open and a capture card shown.
6. Evidence: web suite, typecheck, board axe run on Chromium, retained under `evidence/`.

Interfaces as built: `splitPaste(text): string[]`; `inTypingContext(target): boolean`; `captureLine(c: CaptureView): { tone: "needs" | "wait" | "block"; text }`; `pendingCaptures(all: CaptureView[]): CaptureView[]`; `BoardData.captures`; `<QuickAdd />`; `<CaptureCard capture />`. Quick add posts `{ text, source: "web" }` and no lane.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slice: [board-m1](../board-m1/basis.md).

## Exit criteria

Slice M4 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the quick add field open and a capture card shown, and the owner has made the merge decision. Nothing here claims that intake drafted a package correctly, that the kernel enforces person verification (D-4 is unsigned), or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
