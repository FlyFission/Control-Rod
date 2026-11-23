# Ship: board attention (rework of #142, #143 and #146)

Release decision: **for owner review; no merge is authorized by this record.**

| Check | Reviewer | Date | Result |
|---|---|---|---|
| Blind check, different vendor than the author | not yet run (gap) | deferred | deferred |

- **Proposed:** merge this change; close #142, #143 and #146 as replaced by it.
- **Not claimed:** a real-browser pass. Notifications, the title, the spinner and the shortcut list were exercised in jsdom with a stand-in `Notification`.
- **Not claimed:** any change to what counts as waiting on a person. AW-01 and AW-02 read the same `GET /inbox` as the rail badge.
- **Dropped on purpose:** #142's Cmd/Ctrl+F and DESIGN.md, #146's deliverable cap, usage presenter and asset-origin guard (see [basis](basis.md)).
- **Review findings fixed:** #142 P1 spinner for queued and held runs, P1 Cmd/Ctrl+F in the drawer (removed), P1 untested spinner path, P1 `.tab-hidden` claim (removed); #143 P1 notification text, P1 `?` behind New Work; #146 P1 unwired module (now only the wired routing line ships).

Rollback: revert the commit. Nothing is stored on the server; the only browser storage is the per-person `cr.notify:<user>` key.

Monitoring after merge: with notifications on, a hidden tab should show one notification per new Inbox item and none on reload; the tab title should match the Inbox badge.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On the board, cards marked Needs you or Blocked sort to the top of their column (live, current reads only), and the run spinner turns only while a run is running. The tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on, fire only for new Inbox items while the tab is hidden, carry no record title or reason, and close on sign-out or a change of person; `N` moves to the next card marked Needs you or Blocked in board or list view; `?` opens the shortcut list only when no dialog is open. A run that another model answered shows "Fallback: Answered by X (requested Y)". The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
