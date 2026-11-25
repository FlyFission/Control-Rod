# Verification: Show details in a side panel instead of windows

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | Web: 1014 tests, typecheck, build. | `evidence/web.log` |
| E-02 | pass | Rendered check in Chromium on the dev server with a mocked API (16 checks): docked at 520 px beside the page at 1440, page narrows and stays clickable, another item swaps content, drag widens, Esc and X hide, reopens at the dragged width, overlay at 1024 below the top bar closes on outside click, full width at 390, crossing 1180 px both ways keeps the open panel. Limit: the Board page itself is covered by unit tests only (its live stream is not mocked here). | `evidence/side-check.js`, `evidence/side-check.log` |
| E-03 | pass | Screenshots at 1440, 1024 and 390. | `evidence/*.jpg` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: clicking a card, capture or inbox item opens its details in one side panel; on a wide screen it sits beside the page (resizable, width kept per person) and the page stays usable; narrower it slides over the page and a click outside closes it; X and Esc hide it everywhere; crossing between the two keeps what was typed; web tests, typecheck, build and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
