# Risk: board redesign slice M3, act from the card

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-21 instruction to get the plan into a working ecosystem through pull requests.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec change. The API is unchanged; the web app uses the existing actions, decision options, decide and stop routes. The kernel on the server still decides every decision.
- Scope: `apps/web/src/features/board/` (actions, MoveMenu, CardActions, Card, BoardView, useBoardData, board.css, tests), `docs/status.md`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A decision is offered from a stale or unknown read and signed over work the person did not see. | Actions are put on a card only when its reads are current and the event stream is live; the signature covers the digest the card read, and the server refuses a stale digest or revision; tested (no Accept button while status is unknown). | A card offering a decision while the board says its status is unknown. |
| R-02 | The card face bypasses ruling 16 and offers Accept on Safety or Material work with no covering person verification. | The card uses the same `blockUnverifiedAccept` output as its next line; Accept and Accept with findings are listed disabled with the verification sentence; tested on the board. Screen rule only until D-4 is signed. | An enabled Accept on an unverified Safety or Material card. |
| R-03 | A refused item, or a refused decision, sends a request or moves the card. | A refused item only explains itself; a 409 from decision options stops before decide; the card's column comes from the next read, never from the click; tested. | Any request after choosing a refused item; a column change without a read. |
| R-04 | A decision that needs a reason is signed without one. | Return, Reject and Accept with findings open a reason field and the sign button stays disabled until it has text; tested. | A return, reject or accept with findings sent with an empty reason. |
| R-05 | The menu is unusable by keyboard or by a screen reader. | Real buttons, `menu` and `menuitem` roles, `aria-expanded`, a label naming the card, focus returned on Escape; tested by keyboard alone. | A decision reachable only by mouse. |
| R-07 | Two operations run on one card at once (a second signing flow from the menu, or Stop during a decision), and the first to finish re-enables the card while the other is pending. | One operation in flight per card: a ref guards sign, stop and every menu choice, and Move to is disabled and closed while one is pending; tested. Found by the Codex review of c213acc. | A second decision-options or stop request while one is pending. |
| R-06 | Stop is offered when nothing is running, or reported as done before the run ends. | Stop is listed only while a run is queued or running; success says the stop was requested and the card shows the recorded outcome later; tested. | Stop on a card with no active run. |

## Selected mode

- **Mode:** Standard
- Basis: user-visible behavior on the home screen; signed decisions can now start from the board; no contract or protected surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M3 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned; the Accept block on Safety and Material work is a screen rule), behavior in Firefox or WebKit, or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
