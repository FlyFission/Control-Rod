# Risk: board redesign slice M4, quick add

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-06 instruction (subagent-driven execution of the board redesign plan, one slice per pull request) and the 2026-11-08 instruction to close end-user gaps.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec change of any kind. The API is unchanged; the web app uses the existing `POST /captures`, `POST /captures/:id/classify`, `GET /captures` and requeue routes.
- Scope: `apps/web/src/features/board/` (QuickAdd, CaptureCard, useBoardData, BoardView, board.css, tests), `apps/web/e2e/board-looks.spec.ts`, `docs/status.md`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Text typed on the board reaches an AI runtime before a person classifies its data lane (workbench design M-0). | Quick add posts the capture with no `lane`; the server leaves it unclassified and intake does not run; the capture card shows the lane choices and "Classify the data lane" until classified; tested (`quick-add.test.tsx` posts `{text, source}` only). | Any path from quick add that sets a lane without a person choosing it. |
| R-02 | A capture card claims an intake state the record does not show. | The line is derived from `CaptureView.lane` and `intake.status` only (`captureLine`); a missing intake reads "Waiting for intake"; failed, lost and stopped read as blocked with the server's error text. | A capture line that is not a function of the capture record. |
| R-03 | A capture and the package it became both show as cards. | `pendingCaptures` drops captures whose `package_ids` (or legacy `package_id`) is non-empty and answered captures; tested with two packages from one capture. | A capture card beside its own package card. |
| R-04 | The `c` shortcut fires while a person is typing elsewhere. | `inTypingContext` excludes inputs, textareas, selects and editable regions; modifiers excluded; tested. | Quick add opening from a letter typed in a field. |
| R-05 | A failed captures read empties Ready silently. | The read failure joins the board's problems alert with a Retry and the empty-state text is not shown; tested. | An empty Ready with no alert after a failed read. |
| R-06 | The new elements break accessibility or contrast in a look. | Labels on the field and lane picker, real buttons, focus returned to the opener on Escape; board axe spec extended to scan with the field open and a capture card shown, in looks a, b and c. | An axe violation on the board in any look. |

## Selected mode

- **Mode:** Standard
- Basis: user-visible behavior changes on the home screen; the data-lane rule M-0 is load bearing; no contract or protected surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slice: [board-m1](../board-m1/basis.md).

## Exit criteria

Slice M4 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the quick add field open and a capture card shown, and the owner has made the merge decision. Nothing here claims that intake drafted a package correctly, that the kernel enforces person verification (D-4 is unsigned), or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
