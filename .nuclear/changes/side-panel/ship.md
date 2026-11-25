# Ship: Show details in a side panel instead of windows

Release decision: merge. Two Codex review rounds fixed (E-05, E-06); the automatic runs after the limit were fixed (E-07) except one known item carried to the next PR: reopening the same run log from Runs after Back needs the panel closed first.

## Signature

Owner (sole maintainer): Ben Huffer, yes ("merge") in the project thread, 2026-11-25 16:33 UTC, after choosing "Fix both, then merge" on the decision card at 13:34 UTC.

- Rollback: revert the squash commit; no data or contract change. Saved widths under `cr.side:<user>` are ignored after a revert.
- Monitoring after merge: on a real install (Safari on macOS first), cards open beside the page, PDFs and Word files draw, and nothing on the page is hard to click beside the panel.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: clicking a card, capture or inbox item, or a card link anywhere in the app, opens its details in one side panel; on a wide screen it sits beside the page (resizable, width kept per person) and the page stays usable; narrower it slides over the page and a click outside closes it; X and Esc hide it; an output file (markdown, PDF, Word, code, CSV, image, diff, JSON) or a run's full log opens at the panel's full size over the card, with Back and Esc returning to the card; crossing the breakpoint keeps what was typed; web tests, typecheck, build and the rendered checks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
