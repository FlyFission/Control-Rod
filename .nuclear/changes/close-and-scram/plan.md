# Plan: SCRAM that signs, one way to close, true compact, a readable run log

1. Reproduce the closed SCRAM button on the live stack and list every drawer, dialog and panel with its close control.
2. Add CloseX and the dismiss helpers; apply them everywhere; fix the SCRAM dialog.
3. Compact card face and the full-size log viewer.
4. Unit tests, live tests (drawer, SCRAM dialog, lifecycle), draft PR, Codex blind check, owner yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SCRAM can be signed at once from the active project, and when its button is closed the dialog says why in one line. Every drawer, dialog and panel has the same close X in its top-right corner, Esc closes, and a click outside closes unless typed text would be lost. Compact cards are one line: a status mark and the name. The run log opens at full size with the plain summary first. Web tests, typecheck and the live drawer, SCRAM dialog and lifecycle tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
