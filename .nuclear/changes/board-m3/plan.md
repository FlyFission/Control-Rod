# Plan: board redesign slice M3, act from the card

1. `actions.ts`: `menuItems(actions, runActive)` lists the decisions the server names, in the order Release, Accept, Accept with findings, Return with direction, Reject, by their decision labels (never column names), refused ones disabled with the server's reason and change; Stop run while a run is queued or running. `primaryItem` picks an open Release or Accept for the card face.
2. `MoveMenu.tsx`: a Move to button and a `menu` of `menuitem` buttons; Enter, Space or Down opens on the first item, Up and Down wrap, Home and End jump, Escape closes and returns focus, Tab and an outside click close. Refused items stay focusable with `aria-disabled` so the reason can be read.
3. `CardActions.tsx`: the primary button and the menu. A decision is signed through `decide()` over the digest the card read; Return, Reject and Accept with findings open a reason field first. A refused item, or a server refusal, is said in the card's own alert region and sends nothing more. Success says "{Decision} recorded." and refreshes the board's reads; the card moves only when the next read moves it.
4. `useBoardData.ts`: the card carries `offered` (the actions with ruling 16 applied), `digest` and `activeRunId`, and only when its reads are current and the event stream is live, so no decision is offered from a stale or unknown read.
5. `Card.tsx`, `BoardView.tsx`, `board.css`: an actions slot on the card face.
6. Tests: `move.test.tsx` (12 tests), `board.test.tsx` (two new, one tightened), `e2e/board-looks.spec.ts` scanning with the Move to menu open on a Safety card (refused Accept) and on a running card (Stop run), and selecting the card title exactly now that Move to names the card (also in the agent panel scans that came from main).
7. Evidence: web suite, typecheck and the board axe run on Chromium under `evidence/`.

Deviation from the plan's interface: the plan gave `menuItems` two extra arguments (`verifyStanding`, `acceptBlock`). Ruling 16 is instead applied once, upstream, by the existing `blockUnverifiedAccept` before the actions reach `menuItems`, so the card's next line, its primary button and its menu all read the same refused Accept. The behavior the plan asks for is tested on the board ("puts no Accept button on Safety work that no person has verified").

## Interfaces as built

`menuItems(actions: ActionDescriptor[], runActive: boolean): MenuItem[]`; `primaryItem(items): MenuItem | undefined`; `MenuItem = { id: DecisionKind | "stop"; label; enabled; reason?; change? }`; `<MoveMenu items onChoose cardTitle />`; `<CardActions card passkeys? />`; `BoardCard.offered?`, `BoardCard.digest?`, `BoardCard.activeRunId?`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M3 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned; the Accept block on Safety and Material work is a screen rule), behavior in Firefox or WebKit, or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
