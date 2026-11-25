# Trace: SCRAM that signs, one way to close, true compact, a readable run log

| Need | Code | Test |
| --- | --- | --- |
| SCRAM ready to sign, says what is missing | `features/office/Scram.tsx` | `scram.test.tsx`; `e2e/live/scram-dialog.spec.ts` |
| One close X, Esc, click outside | `components/CloseX.tsx`, `lib/dismiss.ts`, drawers and dialogs | `cockpit.test.tsx` "has the one close button..."; `newwork.test.tsx`; `shell.test.tsx` |
| Compact is one line | `features/board/Card.tsx`, `board.css` | `board.test.tsx` "shows one line per card in compact density..." |
| Full-size run log | `components/LogViewer.tsx`, `RunLog.tsx` | `components.test.tsx` "opens the full log..."; `e2e/live/drawer.spec.ts` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SCRAM can be signed at once from the active project, and when its button is closed the dialog says why in one line. Every drawer, dialog and panel has the same close X in its top-right corner, Esc closes, and a click outside closes unless typed text would be lost. Compact cards are one line: a status mark and the name. The run log opens at full size with the plain summary first. Web tests, typecheck and the live drawer, SCRAM dialog and lifecycle tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
