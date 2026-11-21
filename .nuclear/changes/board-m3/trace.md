# Trace: board redesign slice M3, act from the card

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | Menu items are decision labels, never column names (spec 6.2, B3). | `move.test.tsx` "lists decisions by their decision labels, never column names" | implemented and tested |
| T-02 | A refused decision is listed disabled with the server's reason and change. | `move.test.tsx` "lists a refused decision disabled with the server's reason and change" | implemented and tested |
| T-03 | Only an open Release or Accept sits on the card face. | `move.test.tsx` "puts only an open Release or Accept on the card face"; "ignores commands that are not decisions" | implemented and tested |
| T-04 | Stop appears only while a run is active, and sends the stop request. | `move.test.tsx` "offers Stop only while a run is active"; "offers Stop while a run is active and sends the stop request" | implemented and tested |
| T-05 | A decision is signed over the card's digest and said as recorded; the card stays until the next read. | `move.test.tsx` "signs the primary decision over the card's digest" | implemented and tested |
| T-06 | A server refusal (409 with reason and change) is shown in the card's alert region and nothing more is sent. | `move.test.tsx` "shows the server's refusal in the card and sends nothing more" | implemented and tested |
| T-07 | Choosing a refused menu item explains it and sends no request. | `move.test.tsx` "explains a refused menu item without sending any request" | implemented and tested |
| T-08 | Return asks for a reason before the passkey prompt. | `move.test.tsx` "asks for a reason before signing a return" | implemented and tested |
| T-09 | The menu works by keyboard alone; Escape returns focus to Move to. | `move.test.tsx` "is usable by keyboard alone" | implemented and tested |
| T-10 | No actions without current, live reads. | `move.test.tsx` "shows nothing when the card offers no current actions"; `board.test.tsx` "says status is unknown" (no Accept button) | implemented and tested |
| T-11 | The board acts from the card: Accept on the face and Move to beside it. | `board.test.tsx` "acts from the card" | implemented and tested |
| T-12 | Ruling 16: no Accept on Safety work that no person has verified; Accept is listed disabled. | `board.test.tsx` "puts no Accept button on Safety work that no person has verified" | implemented and tested |
| T-14 | One operation at a time per card: while a signature is pending, the primary button and Move to are disabled and no second request is sent. | `move.test.tsx` "allows one operation at a time" | implemented and tested |
| T-13 | The board stays axe clean in looks a, b and c with the Move to menu open, and Escape returns focus to Move to in a real browser. | `e2e/board-looks.spec.ts` | implemented; run on Chromium (E-03) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M3 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned; the Accept block on Safety and Material work is a screen rule), behavior in Firefox or WebKit, or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
