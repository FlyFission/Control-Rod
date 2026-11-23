# Trace: the Plant view

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | The plant layout is valid: zones nest, regions in their zone, nothing in the reactor, doors on walkways, queues on walkways of their zone, gates connected. | `plant-layout.test.ts` | implemented and tested |
| T-02 | The annunciator has four windows, dark when normal; Waiting on you is `needs_me`; a drill alone never lights SCRAM; missing reads say Loading or Unavailable, never 0. | `plant-instruments.test.ts`; `office-view.test.tsx` | implemented and tested |
| T-03 | The core is lit only while a shown agent works; presenting mode says how many are hidden. | `plant-instruments.test.ts` | implemented and tested |
| T-04 | The rods follow the SCRAMs in force: unknown, withdrawn, inserted (stop claimed only once recorded), bank, drill. | `plant-instruments.test.ts` | implemented and tested |
| T-05 | The view opens on the Plant; office themes are under Advanced; the old storage key is ignored; `/office` redirects to `/plant`. | `office-view.test.tsx`; `places.test.tsx`; `contract.test.ts` | implemented and tested |
| T-06 | Every figure is reachable in the list view, grouped by zone. | `office-view.test.tsx` | implemented and tested |
| T-07 | The plant theme passes the contract validator and the allowlisted SVG check. | `contract.test.ts` | implemented and tested |
| T-08 | Contrast, state shapes, lenses, the worst case of every place filled with every mark, and motion that stops with reduced motion and in a hidden tab hold on the plant at minimum zoom in a real browser. | `e2e/office-harness.spec.ts` | implemented; run on Chromium (E-03) |
| T-09 | The real page reads well at 1440 and 390 wide and with an organization SCRAM in force, after the visual overhaul the owner asked for. | Screenshots (E-05) | captured; owner review open |
| T-10 | Switching between the Plant and an archived theme keeps every figure's element (the console frame keeps one element tree). | `e2e/office-harness.spec.ts` "a theme switch keeps selection" | implemented; run on Chromium (E-03) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design: [plant view design](../../../docs/superpowers/specs/2026-11-23-plant-view-design.md). Earlier work: [overlay-themes](../overlay-themes/basis.md).

## Exit criteria

The Plant view is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, validation with real users, or that the art resembles any real facility; it is a stylized plan, not an engineering drawing.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
