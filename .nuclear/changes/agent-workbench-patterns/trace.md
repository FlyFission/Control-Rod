# Trace: agent workbench patterns and attention signals

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| AW-01 The tab title shows the count of items waiting on the viewer, only after a successful Inbox read, and drops it after a failed refresh or when the shell goes away. | `lib/attention.ts` `titleWithCount`; `lib/useAttentionSignals.ts`; `components/Shell.tsx` | `attention.test.ts` "tab title count"; `useAttentionSignals.test.tsx` "tab title"; `shell.test.tsx` "tab title" | implemented and tested |
| AW-02 Notifications are off until the person turns them on; permission is asked only from that control; they fire once per read for items new since the previous successful read, only while the tab is hidden, never for the first read, never across people; the text is the item's own. | `lib/attention.ts`; `lib/useAttentionSignals.ts`; `components/NotifyToggle.tsx`; `pages/Inbox.tsx` | `useAttentionSignals.test.tsx` "notifications" (five cases); `attention.test.ts` "new arrivals", "notification text", "notify choice"; `inbox.test.tsx` "Inbox notifications opt-in" (three cases) | implemented and tested |
| AW-03 `N` on the board moves to the next card marked Needs you or Blocked, in board order, wrapping, and says so when none is marked. | `features/board/BoardView.tsx` | `board.test.tsx` "N jumps to the next card...", "N says so when no card..." | implemented and tested |
| AW-04 `?` outside a field, or the rail's Shortcuts button, opens the shortcut list; Escape, `?` and Close shut it; no other shortcut fires while it is open; `?` typed in a field stays in the field. | `components/ShortcutHelp.tsx`; `components/Shell.tsx`; `styles.css` | `shell.test.tsx` "keyboard shortcut list" (three cases, one of them checks that other shortcuts do not fire behind the open list) | implemented and tested |
| AW-05 The pattern note gives a decision and gate for AW1 to AW19 in our own words. | `docs/patterns/agent-workbenches.md`; `docs/patterns/README.md` | six-word overlap check (E-03) | written; owner review open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 work in the web app: the tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on and then fire only for new Inbox items while the tab is hidden; `N` on the board moves to the next card marked Needs you or Blocked; `?` opens the shortcut list. The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
