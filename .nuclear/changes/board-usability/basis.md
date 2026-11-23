# Desktop board usability

**Change slug:** `board-usability`
**Date:** 2026-11-21

The owner found the Control Rod interface overwhelming for everyday developer use. The running fixture showed downstream stages out of sight on desktop, duplicated attention controls, dense toolbar settings and actions clipped by the board scroller.

Scope covers the web workspace header and board toolbar, stages, cards, action menu and empty results. The board redesign establishes lifecycle and signature rules. The Vibe Kanban filter bar informed the disclosure pattern. See [board redesign](../board-redesign/basis.md), [lenses](../board-m2/basis.md), and [donor restrictions](../../../docs/patterns/workbench-donors.md).

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
| --- | --- | --- | --- | --- | --- |
| D1 | Prioritize desktop | "Developers will mostly use it on a web app, so I'd call desktop the primary and phone ancillary." | 2026-11-21, chat | Focus the first improvement on the desktop work loop. | Phone navigation redesign. |
| D2 | Reduce cognitive load | "Put yourself in a normal developers shoes though, our application is overwhelming, I appreciate the rigor, but my ADHD makes this seem daunting and its a bit over the top on some elements" | 2026-11-21, chat | Give titles, next steps, and blockers priority. Keep setup and display choices available through disclosure. | Changes to the underlying review and signature rules. |
| D3 | Put dismissal and removal in the detail drawer | none: authoring agent's choice, open to the owner | 2026-11-21, chat | Keep destructive actions in the context of a single card. | Changes to what dismissal or removal does. |

## Required links

[risk](risk.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Review the desktop board and record unit, build and browser evidence.

## Source-lineage note

Repository change-control evidence. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md).
