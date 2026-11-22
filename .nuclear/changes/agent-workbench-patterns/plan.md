# Plan: agent workbench patterns and attention signals

1. Read the public README of Orchestrator.inc, Vibe Kanban and Paradev at pinned commits, Orchestrator.inc's architecture document, and the Claude Code desktop documentation. Compare with the board, Inbox, Today and the gap analysis.
2. Write `docs/patterns/agent-workbenches.md` with a decision and gate for each item, and list it in `docs/patterns/README.md`.
3. Build AW1 to AW4 in `apps/web`: `lib/attention.ts` and `lib/useAttentionSignals.ts` (title count and notifications from the shell's Inbox read), `components/NotifyToggle.tsx` on the Inbox, `components/ShortcutHelp.tsx` opened by `?` or the rail button, and `N` in `BoardView`.
4. Test each rule in R-01 to R-06; run the web typecheck and the full web suite; run the wording check.
5. Owner review. AW5 (Today agrees with the Inbox) and AW7 (collapse old Accepted) are proposed next, each with its own record.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 work in the web app: the tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on and then fire only for new Inbox items while the tab is hidden; `N` on the board moves to the next card marked Needs you or Blocked; `?` opens the shortcut list. The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
