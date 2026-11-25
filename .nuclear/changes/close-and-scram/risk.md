# Risk: SCRAM that signs, one way to close, true compact, a readable run log

- A prefilled SCRAM reason makes stopping easier. That is the point of an emergency stop; the passkey signature, the count and the server's checks are unchanged, and the reason can be edited before signing.
- A click outside could lose a half-written note. Mitigation: a drawer or dialog with typed text (a textarea, or a field marked data-guard) stays open; the SCRAM dialog stays open while signing.
- Compact hides chips and the next line from sight. Mitigation: the status mark stays, the next line is the hover text and screen-reader text, and Comfortable is one click away.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: web-only change, reversible by revert, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SCRAM can be signed at once from the active project, and when its button is closed the dialog says why in one line. Every drawer, dialog and panel has the same close X in its top-right corner, Esc closes, and a click outside closes unless typed text would be lost. Compact cards are one line: a status mark and the name. The run log opens at full size with the plain summary first. Web tests, typecheck and the live drawer, SCRAM dialog and lifecycle tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
