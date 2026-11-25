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
4. The card drawer, the capture drawer and the Inbox's drawer render through it. Quick confirms, the command palette, shortcut help, New change and New project stay dialogs.
5. Cards anywhere else open in the panel too: Today, Packages, the Runs list, registers, captures and the Plant's agent card use `CardLink` (a real link to the case page, so Cmd/Ctrl-click still opens a tab). A run link opens the card with that run's full log over it.
6. Files and logs at full size (owner, 2026-11-25: "open up various files ... a document, a PDF, and different markdowns with excellence"): "Expand" on an output, or "Open full log" on a run, opens it over the card in the same panel, which widens while it is open. Viewers, each loaded only when needed: markdown with GitHub tables and task lists (react-markdown + remark-gfm, MIT, raw HTML off, only web and mail links), code and JSON with colours (Shiki, MIT, JavaScript regex engine, grammars on demand), PDF page by page at the panel's width (react-pdf, MIT, over Mozilla pdf.js, Apache-2.0), Word documents (docx-preview, Apache-2.0, with Symbol-font bullets repaired), CSV and TSV as a table (Papa Parse, MIT), images that fit or show full size, diffs and GeoJSON as before. A viewer that fails shows a plain line and the raw link and never takes the panel down.

## Out of scope

- `spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/`: untouched.
- A browser view in the panel (preview a page or a running app): a follow-up on this host.
- Spreadsheets (.xlsx) and slides: Open in a new tab or Download for now.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: clicking a card, capture or inbox item, or a card link anywhere in the app, opens its details in one side panel; on a wide screen it sits beside the page (resizable, width kept per person) and the page stays usable; narrower it slides over the page and a click outside closes it; X and Esc hide it; an output file (markdown, PDF, Word, code, CSV, image, diff, JSON) or a run's full log opens at the panel's full size over the card, with Back and Esc returning to the card; crossing the breakpoint keeps what was typed; web tests, typecheck, build and the rendered checks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
