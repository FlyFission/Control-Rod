# Ship: board attention (rework of #142, #143 and #146)

Release decision: **for owner review; no merge is authorized by this record.**

| Check | Reviewer | Date | Result |
|---|---|---|---|
| Blind check, different vendor than the author | Codex (read-only) at `09754865` | 2026-11-23 | FIX FIRST: 0 P0, 2 P1, 3 P2. All five addressed in the next commit (below). |
| Second blind check | Codex (read-only) at `3bb081d0` | 2026-11-23 | FIX FIRST: 2 P1, 3 P2. All five addressed in `4a3fe20b` (below). |
| Blind check of the fixes | not yet run (gap) | deferred | deferred |

- **Proposed:** merge this change; close #142, #143 and #146 as replaced by it.
- **Not claimed:** a real-browser pass. Notifications, the title, the spinner and the shortcut list were exercised in jsdom with a stand-in `Notification`.
- **Not claimed:** any change to what counts as waiting on a person. AW-01 and AW-02 read the same `GET /inbox` as the rail badge.
- **Dropped on purpose:** #142's Cmd/Ctrl+F and DESIGN.md, #146's deliverable cap, usage presenter and asset-origin guard (see [basis](basis.md)).
- **Codex findings at `3bb081d0`, fixed:** P1 "gpt-5.4" answered by "gpt-5.4-mini" was treated as an alias; only a bare family word that is a whole dash-separated part of the reported name counts now (MR-01, test added). P1 the shortcut switch did nothing when browser storage refused the write; the choice is now also kept in the page (SK-01, test added). P2 single keys could open things behind an ARIA modal (the theme gallery); every handler now also treats `[role="dialog"][aria-modal="true"]` as open. P2 a run lost again on the same revision did not notify; a lost item is now keyed by when it became lost (AW-01, test added). P2 the notification toggle missed a change made in another tab; it now follows storage events.
- **Codex findings at `09754865`, fixed:** P1 an alias resolving to its concrete model ("opus" to "claude-opus-5-5") was labelled a fallback; now it is not (MR-01). P1 single-character shortcuts could not be turned off (WCAG 2.1.4); a switch in the shortcut list turns C, J, K, N and ? off on this browser (SK-01). P2 the record promised one notification per item; it now says one per refresh. P2 title and badge after a failed refresh: stated above. P2 the spinner test could pass before the queued and held cards rendered; it now waits for both.
- **Earlier review findings fixed:** #142 P1 spinner for queued and held runs, P1 Cmd/Ctrl+F in the drawer (removed), P1 untested spinner path, P1 `.tab-hidden` claim (removed); #143 P1 notification text, P1 `?` behind New Work; #146 P1 unwired module (now only the wired routing line ships).

Rollback: revert the commit. Nothing is stored on the server; the only browser storage is the per-person `cr.notify:<user>` key.

Monitoring after merge: with notifications on, a hidden tab should show one notification per Inbox refresh that brings new items (one item named by kind, several as a count) and none on reload. The tab title matches the Inbox badge while reads succeed; after a failed refresh the title drops its number while the badge keeps the last-known count, on purpose, because the title is read outside the app.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On the board, cards marked Needs you or Blocked sort to the top of their column (live, current reads only), and the run spinner turns only while a run is running. The tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on, fire once per refresh that brings new Inbox items while the tab is hidden, carry no record title or reason, and close on sign-out or a change of person; `N` moves to the next card marked Needs you or Blocked in board or list view; `?` opens the shortcut list only when no dialog is open, and single-character shortcuts can be turned off there. A run that another model answered shows "Fallback: Answered by X (requested Y)". The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
