# Trace: board attention (rework of #142, #143 and #146)

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| BA-01 Package cards marked Needs you or Blocked sort first in their column, keeping order otherwise; only live, current tones count. | `features/board/boardOrder.ts` `attentionFirst`; `BoardView.tsx`; `BoardListView.tsx` | `board.test.tsx` "puts cards that need you at the top of their column" | implemented and tested |
| BA-02 The run spinner turns only for a running run; queued and held runs do not spin; reduced motion stops it. | `boardOrder.ts` `showsRunSpinner`; `useBoardData.ts` `runRunning`; `Card.tsx`; `board.css` | `board.test.tsx` "turns the run spinner only for a run that is running" (which runs show it); reduced motion is a CSS rule in `board.css`, read, not tested (jsdom does not animate) | implemented; motion rule untested |
| AW-01 The tab title shows the count of items waiting on the viewer, only after a successful Inbox read, and drops it after a failed refresh or when the shell goes away. | `lib/attention.ts`; `lib/useAttentionSignals.ts`; `components/Shell.tsx` | `attention.test.ts`; `useAttentionSignals.test.tsx` "tab title"; `shell.test.tsx` "tab title" | implemented and tested |
| AW-02 Notifications are off until turned on; fire once per refresh that brings new items, only while the tab is hidden; never for the first read or across people; carry only a kind and count; close on sign-out or change of person. | `lib/attention.ts`; `lib/useAttentionSignals.ts`; `components/NotifyToggle.tsx`; `pages/Inbox.tsx` | `useAttentionSignals.test.tsx` "notifications"; `attention.test.ts` "never carries a record's title or a SCRAM reason"; `inbox.test.tsx` | implemented and tested |
| AW-03 `N` moves to the next card marked Needs you or Blocked, in board or list view, and says so when none is marked. | `features/board/BoardView.tsx` | `board.test.tsx` "N jumps...", "N says so...", "N continues from the card that holds focus..." | implemented and tested |
| AW-04 `?` outside a field and with no dialog open, or the rail's Shortcuts button, opens the list; Escape, `?` and Close shut it. | `components/ShortcutHelp.tsx`; `components/Shell.tsx` | `shell.test.tsx` "keyboard shortcut list" | implemented and tested |
| MR-01 A run answered by a different model than requested shows "Fallback: Ran as X (requested Y)"; "default" and an alias contained in the reported name are not fallbacks; a finished run that requested a model but reported none says so; a run with no model trace at all (stopped before it started) shows no line. | `lib/modelRouting.ts`; `components/RunLog.tsx` | `modelRouting.test.ts` | implemented and tested |
| SK-01 Single-character shortcuts (C, J, K, N, ?) can be turned off on this browser from the shortcut list; Ctrl/Cmd K, Escape and the Shortcuts button still work. | `lib/singleKeys.ts`; `components/ShortcutHelp.tsx`; `components/Shell.tsx`; `features/board/BoardView.tsx`; `features/board/QuickAdd.tsx` | `shell.test.tsx` "single-key shortcuts switch"; `singleKeys.test.ts` (storage refused, another tab) | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On the board, package cards marked Needs you or Blocked sort to the top of their column (live, current reads only; capture rows keep their order), and the run spinner turns only while a run is running. The tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on, fire once per refresh that brings new Inbox items while the tab is hidden, carry no record title or reason, and close on sign-out or a change of person; `N` moves to the next card marked Needs you or Blocked in board or list view, only while the board is live; `?` opens the shortcut list only when no dialog is open, and single-character shortcuts can be turned off there. A run that another model answered shows "Fallback: Ran as X (requested Y)". The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
