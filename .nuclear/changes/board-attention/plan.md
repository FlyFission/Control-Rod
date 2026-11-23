# Plan: board attention (rework of #142, #143 and #146)

1. Cherry-pick #143's web commits onto main; resolve conflicts with the workspace-projects and list-view work; fix both #143 review findings (notification text, `?` behind dialogs).
2. Port #142's attention-first order and truthful spinner as `features/board/boardOrder.ts`; drop its search, Cmd/Ctrl+F and DESIGN.md; test the spinner through real run data.
3. Port #146's model reroute idea as `lib/modelRouting.ts`, wired into `RunCard`; drop the unwired presenters and the origin guard.
4. Run the web typecheck and the full web suite.
5. Blind check by a different vendor than the author (Codex), then owner review.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On the board, cards marked Needs you or Blocked sort to the top of their column (live, current reads only), and the run spinner turns only while a run is running. The tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on, fire once per refresh that brings new Inbox items while the tab is hidden, carry no record title or reason, and close on sign-out or a change of person; `N` moves to the next card marked Needs you or Blocked in board or list view; `?` opens the shortcut list only when no dialog is open, and single-character shortcuts can be turned off there. A run that another model answered shows "Fallback: Answered by X (requested Y)". The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
