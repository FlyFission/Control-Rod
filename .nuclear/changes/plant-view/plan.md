# Plan: the Plant view

The full design is [the plant view design](../../../docs/superpowers/specs/2026-11-23-plant-view-design.md) (v2, after review).

1. `layout.ts`: share region geometry checks (`checkRegionGeometry`) and a `StageLayout` interface between the office and plant layouts.
2. `plant-layout.ts`: one plan view on the existing 1200 wide canvas: site, plant fence, auxiliary building and reactor building; walkways, gates, and `validatePlantLayout`.
3. `contract.ts`: a theme may declare `layout: "plant"` and a `site` drawing; both are validated.
4. `scripts/build-plant-theme.ts`: generate the plant art, registered first in `released.json`; `registry.ts` makes it the default and lists the others as archived choices.
5. `plant-instruments.ts`, `Annunciator.tsx`, `ReactorCore.tsx`: the annunciator, core and rods as pure state functions and app owned drawings.
6. `OfficeStage.tsx`, `OfficeView.tsx`, `PlantList.tsx`, `office.css`: render the plant, the zone legend, the list view, Advanced, and switch to the list when the drawing does not fit.
7. Route `/plant`, `/office` redirects; navigation label Plant.
8. Tests: unit tests for layout, instruments and the view; the theme harness made layout aware.
9. Docs: README, status, `docs/office-view/plant.md`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design: [plant view design](../../../docs/superpowers/specs/2026-11-23-plant-view-design.md). Earlier work: [overlay-themes](../overlay-themes/basis.md).

## Exit criteria

The Plant view is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, validation with real users, or that the art resembles any real facility; it is a stylized plan, not an engineering drawing.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
