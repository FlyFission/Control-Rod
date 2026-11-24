# Verification: Make the sidebar resizable and collapsible

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | Web: all tests, `tsc` clean, build, license gate; bundle growth. | `evidence/web.log` |
| E-02 | pass | Rendered check in Chromium on the dev server with a mocked API: default width, drag to widen, max, keyboard narrow, reload keeps width, window resize keeps pixels, hide by button, inert, Tab skips, stays hidden after reload, `[` shows at saved width, drag past minimum hides, double-click resets, clicks near the edge reach the workspace, phone has no handle or toggle and no horizontal scroll (20 checks). | `evidence/rail-check.js`, `evidence/rail-check.log` |
| E-03 | pass | Screenshots at 1440 (default, widened, hidden) and 390. | `evidence/*.jpg` |

Not done here: macOS Safari and Firefox; touch dragging on a tablet.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: on a wide screen the navigation rail can be dragged wider (up to 480 px) or narrower (down to 200 px), hidden and shown again from the top bar or with `[`, and keeps each person's width and hidden state across reloads; long project names wrap to two lines and show in full on hover; the phone layout is unchanged; web tests, typecheck, build, license gate and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
