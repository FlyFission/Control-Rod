# Basis: board attention (rework of #142, #143 and #146)

**Change slug:** `board-attention`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** whether the board attention changes ported from #142, #143 and #146 may ship in the web app.

## Mission / need

The board is the product's top priority, and its first job is answering "which of my agents needs me now?". Three agent-orchestrator pattern PRs each held part of that answer and each failed its blind review (FIX FIRST). This change carries the parts that still add value on current main, fixes the review findings, and drops the rest.

## Scope

In scope: attention-first order in board and list columns and a spinner only for running runs (from #142); the tab title count, opt-in notifications, `N` and the `?` list (from #143); the fallback model line on run cards (from #146); tests; this record. Out of scope, dropped: #142's board search and Cmd/Ctrl+F (main already has board search, and taking over browser find was a review finding) and its `apps/web/DESIGN.md` (it describes the office themes the Plant view replaces); #146's deliverable cap, usage presenter and asset-origin guard (nothing on the board shows those data today, and the guard failed open in review); the #143 pattern note, which moves to the #138 rework because pattern notes wait on a person's wording check.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Rework the agent-orchestrator PRs that add value and are not obsolete, rather than close them. | "I mentioned, instead of closing them, that we would rework them. As long as they add value. And are not obsolete." | 2026-11-23, project thread "Rework the agent-orchestrator PRs" | Port what still adds value on main, fix review findings, drop what main already has. | Trust-surface changes. |
| D2 | Combine #142, #143 and #146 into one board PR; close #140, #144 and #145. | Chose "Yes, go with these calls" on the decision card. | 2026-11-23, same thread | This PR replaces #142, #143 and #146. | The daemon reworks (#139, #141). |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Notifications from the page (`new Notification`) work in desktop Chromium, Firefox and Safari while the tab is open. | Browser platform behavior; not run in a real browser in this change. | A browser that throws; the hook catches it and the title count still shows. |
| `trace.requested_model` is "default" when the run left the choice to the runtime. | Its description in `spec/generated/openapi/openapi.json`. | A spec change to that field. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On the board, cards marked Needs you or Blocked sort to the top of their column (live, current reads only), and the run spinner turns only while a run is running. The tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on, fire once per refresh that brings new Inbox items while the tab is hidden, carry no record title or reason, and close on sign-out or a change of person; `N` moves to the next card marked Needs you or Blocked in board or list view; `?` opens the shortcut list only when no dialog is open, and single-character shortcuts can be turned off there. A run that another model answered shows "Fallback: Answered by X (requested Y)". The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
