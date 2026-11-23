# Trace: board attention (rework of #142, #143 and #146)

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| BA-01 Cards marked Needs you or Blocked sort first in their column, keeping order otherwise; only live, current tones count. | `features/board/boardOrder.ts` `attentionFirst`; `BoardView.tsx`; `BoardListView.tsx` | `board.test.tsx` "puts cards that need you at the top of their column" | implemented and tested |
| BA-02 The run spinner turns only for a running run; queued and held runs do not spin; reduced motion stops it. | `boardOrder.ts` `showsRunSpinner`; `useBoardData.ts` `runRunning`; `Card.tsx`; `board.css` | `board.test.tsx` "turns the run spinner only for a run that is running" | implemented and tested |
| AW-01 The tab title shows the count of items waiting on the viewer, only after a successful Inbox read, and drops it after a failed refresh or when the shell goes away. | `lib/attention.ts`; `lib/useAttentionSignals.ts`; `components/Shell.tsx` | `attention.test.ts`; `useAttentionSignals.test.tsx` "tab title"; `shell.test.tsx` "tab title" | implemented and tested |
| AW-02 Notifications are off until turned on; fire only for new items while the tab is hidden; never for the first read or across people; carry only a kind and count; close on sign-out or change of person. | `lib/attention.ts`; `lib/useAttentionSignals.ts`; `components/NotifyToggle.tsx`; `pages/Inbox.tsx` | `useAttentionSignals.test.tsx` "notifications"; `attention.test.ts` "never carries a record's title or a SCRAM reason"; `inbox.test.tsx` | implemented and tested |
| AW-03 `N` moves to the next card marked Needs you or Blocked, in board or list view, and says so when none is marked. | `features/board/BoardView.tsx` | `board.test.tsx` "N jumps...", "N says so..." | implemented and tested |
| AW-04 `?` outside a field and with no dialog open, or the rail's Shortcuts button, opens the list; Escape, `?` and Close shut it. | `components/ShortcutHelp.tsx`; `components/Shell.tsx` | `shell.test.tsx` "keyboard shortcut list" | implemented and tested |
| MR-01 A run answered by a different model than requested shows "Fallback: Answered by X (requested Y)"; "default" is not a fallback; a finished run without a reported model says so. | `lib/modelRouting.ts`; `components/RunLog.tsx` | `modelRouting.test.ts` | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On the board, cards marked Needs you or Blocked sort to the top of their column (live, current reads only), and the run spinner turns only while a run is running. The tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on, fire only for new Inbox items while the tab is hidden, carry no record title or reason, and close on sign-out or a change of person; `N` moves to the next card marked Needs you or Blocked in board or list view; `?` opens the shortcut list only when no dialog is open. A run that another model answered shows "Fallback: Answered by X (requested Y)". The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
