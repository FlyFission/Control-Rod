# Basis: Show details in a side panel instead of windows

**Change slug:** `side-panel`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Mission / need

The owner asked on 2026-11-25 for a sidebar that breaks out when something is clicked, instead of windows, easy to hide, with only very light things left as small windows; and to reuse a mature open-source implementation rather than invent one.

## What already exists

- The card drawer (`BoardReviewDrawer`) is a fixed overlay up to 560 px wide with a heavy shadow, closed by X, Esc or any outside click; the capture drawer sat in a grid column on the Board; the Inbox reserved a 440 px grid column for the same drawer.
- `react-resizable-panels` 4.22.1 (MIT) already lays out the rail (change `resizable-rail`).

## Reference

Vibe Kanban (BloopAI/vibe-kanban, Apache-2.0, React): its workspace layout opens a right-hand panel (changes, logs, preview) as a conditionally mounted `Panel` with a `Separator` in a `react-resizable-panels` `Group`, keeps the panel size per person, and on phones hides rather than unmounts so state survives. The pattern is ported; no code is copied. Hermes Desktop (Nous Research, MIT) has a right-hand preview pane; its source is Python plus an unconfirmed Electron UI, so it is a behaviour reference only.

## Proposal

1. `components/SidePanel.tsx`: a `SidePanel` wrapper that portals its children into one stable slot element owned by the shell, and tells the shell it is open while mounted.
2. The shell wraps the page in a `Group`: from 1180 px the slot sits in a resizable `Panel` beside the page (380 to 960 px, default 520, saved per person in `cr.side:<user>`); narrower, it slides over the page from the right below the top bar and any SCRAM banner. The slot element is moved between the two, never recreated, so typed text survives the switch.
3. Docked, a click on the page keeps the panel (the person works beside it); over the page, an outside click closes it as before. X and Esc close it everywhere (unchanged in the drawers).
4. The card drawer, the capture drawer and the Inbox's drawer render through it. Quick confirms, the command palette, shortcut help, New change and New project stay dialogs for now.

## Out of scope

- `spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/`: untouched.
- File viewers in the panel (markdown, PDF, documents, code, images) and a browser view: follow-up changes on this host.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: clicking a card, capture or inbox item opens its details in one side panel; on a wide screen it sits beside the page (resizable, width kept per person) and the page stays usable; narrower it slides over the page and a click outside closes it; X and Esc hide it everywhere; crossing between the two keeps what was typed; web tests, typecheck, build and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
