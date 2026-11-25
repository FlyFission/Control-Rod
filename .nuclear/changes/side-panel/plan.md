# Plan: Show details in a side panel instead of windows

1. Check Hermes Desktop's pane and license; find the most mature open-source implementation on this stack (Vibe Kanban).
2. Build the host and wrapper; render the three drawers through it; drop the grid columns the drawers used to reserve.
3. Unit tests for the wrapper and the width store; rendered check in Chromium at 1440, 1024 and 390 px; screenshots; draft PR; at most two Codex blind checks.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: clicking a card, capture or inbox item opens its details in one side panel; on a wide screen it sits beside the page (resizable, width kept per person) and the page stays usable; narrower it slides over the page and a click outside closes it; X and Esc hide it everywhere; crossing between the two keeps what was typed; web tests, typecheck, build and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
