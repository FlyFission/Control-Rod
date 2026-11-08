# Trace: board redesign slice M4, quick add

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | Typing a title and Enter posts one capture with no lane and leaves a fresh, focused field (spec 6.3). | `quick-add.test.tsx` "posts one capture on Enter" | implemented and tested |
| T-02 | Escape closes and returns focus to the opener; a typed draft survives losing focus. | `quick-add.test.tsx` "closes on Escape" | implemented and tested |
| T-03 | `c` opens quick add outside a field and never from inside one. | `quick-add.test.tsx` "opens from the c key"; `inTypingContext` unit test | implemented and tested |
| T-04 | Pasting several lines offers one card per line and posts them all, in order. | `quick-add.test.tsx` "offers one card per pasted line"; `splitPaste` unit test | implemented and tested |
| T-05 | A server refusal shows in place with the API's reason and the text is kept. | `quick-add.test.tsx` "shows the server's refusal" | implemented and tested |
| T-06 | A new capture card reads "Classify the data lane" with the lane choices inline; classifying posts `/classify`; it then reads "Intake drafting". | `quick-add.test.tsx` "classifies the lane inline"; `captureLine` unit test | implemented and tested |
| T-07 | A failed intake shows its error and offers Retry intake. | `quick-add.test.tsx` "shows a failed intake" | implemented and tested |
| T-08 | When the capture lists package ids, the capture card gives way to those package cards. | `quick-add.test.tsx` "gives way to the package cards"; `pendingCaptures` unit test | implemented and tested |
| T-09 | A failed captures read is said in the board's alert with Retry, and the empty state is not shown. | `quick-add.test.tsx` "keeps the board usable" | implemented and tested |
| T-10 | The empty board explains the field and the lane step. | `board.test.tsx` "guides the first card" | implemented and tested |
| T-11 | The board stays axe clean in looks a, b and c with the field open and a capture card shown. | `e2e/board-looks.spec.ts` | implemented; run on Chromium (E-02) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slice: [board-m1](../board-m1/basis.md).

## Exit criteria

Slice M4 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the quick add field open and a capture card shown, and the owner has made the merge decision. Nothing here claims that intake drafted a package correctly, that the kernel enforces person verification (D-4 is unsigned), or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
