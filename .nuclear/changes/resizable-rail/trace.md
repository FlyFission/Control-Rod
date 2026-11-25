# Trace: Make the sidebar resizable and collapsible

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| RR-01 Drag the rail wider or narrower, within limits. | `Shell.tsx` Group/Panel/Separator | rail-check: drag, max 480, min collapses | implemented and tested |
| RR-02 Hide and show the rail. | top-bar `.rail-toggle`, `[` key | `shell-rail.test.tsx`; rail-check | implemented and tested |
| RR-03 Keyboard accessible. | library separator (arrow keys), button, `[`, inert when hidden | rail-check ArrowLeft and Tab; unit tests | implemented and tested |
| RR-04 Width kept per person. | `lib/railLayout.ts` | unit tests (per person, clamp, junk); rail-check reload and window resize | implemented and tested |
| RR-05 Long names readable. | two-line names, tooltips, chip only when wide | unit test (tooltip); rail-check (no name cut after widening) | implemented and tested |
| RR-06 Phone unchanged. | phone branch untouched | existing phone tests; rail-check at 390 | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: on a wide screen the navigation rail can be dragged wider (up to 480 px) or narrower (down to 200 px), hidden and shown again from the top bar or with `[`, and keeps each person's width and hidden state across reloads; long project names wrap to two lines and show in full on hover; the phone layout is unchanged; web tests, typecheck, build, license gate and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
