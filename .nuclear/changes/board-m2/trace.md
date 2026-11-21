# Trace: board redesign slice M2, lenses

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | Lens URL parsing and serialization round-trip with defaults omitted and unknown values falling back to `DEFAULT_LENS` (Task 5). | `lenses.test.ts` "round-trips lenses through URL query parameters and omits defaults", "falls back to defaults for unknown query values" | implemented and tested |
| T-02 | Kind toggle shows counts, filters cards, updates the URL, and restores on reload (Task 6). | `LensBar.test.tsx` "renders kind counts, toggles, selects, density, and saved view controls"; `board.test.tsx` "shows kind counts, filters by kind, updates the URL, and restores on reload" | implemented and tested |
| T-03 | `Needs you` keeps `needs` and `block` cards only, and clicking the header `Needs you` count toggles the lens (Tasks 4, 5, 6). | `lenses.test.ts` "keeps needs and block cards only under the Needs you lens"; `board.test.tsx` "toggles Needs you from the header count button as well as the lens bar" | implemented and tested |
| T-04 | `Mine` filters by the signed-in user name (Tasks 5, 6). | `lenses.test.ts` "filters Mine by the signed-in user name"; `board.test.tsx` default-view guard test | implemented and tested |
| T-05 | Default-view guard counts hidden `person-verifies` and `needs-signature` cards, displays singular/plural notice with `Show`, and `revealHidden` clears `kind`, `needs`, and `mine` (including from saved views) while keeping `colorBy`, `groupBy`, and `density` (Tasks 5, 6, A-4). | `lenses.test.ts` "identifies protected columns...", "counts hidden protected cards...", "revealHidden clears kind, needs, and mine..."; `board.test.tsx` "enforces the default-view guard...", "pluralizes the default-view guard notice..." | implemented and tested |
| T-06 | `edgeColor` never returns a fixed meaning token (`--needs`, `--check`, `--stuck`, `--done`) across all `colorBy` modes, and the legend names the active color lens (Tasks 5, 6, A-3). | `lenses.test.ts` "never returns a fixed meaning token from edgeColor for any colorBy mode"; `board.test.tsx` "groups by person into swimlanes with counts, and updates the legend for colorBy" | implemented and tested |
| T-07 | `groupBy` renders swimlanes with counts (`person`, `kind`, `project`) (Task 6). | `board.test.tsx` "groups by person into swimlanes with counts, and updates the legend for colorBy" | implemented and tested |
| T-08 | Saved views persist per user under `cr.views.<user>`, fall back to `[]` on storage error/corruption, and can be saved, selected, and deleted (Task 6). | `LensBar.test.tsx` "isolates saved views per user...", "falls back to [] on invalid JSON or localStorage errors", "offers Delete view..."; `board.test.tsx` default-view guard saved-view scenario | implemented and tested |
| T-09 | Compact density hides avatars and grade chips while preserving the next line (Task 6). | `board.test.tsx` "hides avatars and grade chips in compact density while keeping the next line" | implemented and tested |
| T-10 | Design contrast, type scale, and WCAG 2.2 AA accessibility across looks a, b, and c (Task 6, G-6). | `contrast.test.ts`, `type-scale.test.ts`, `e2e/board-looks.spec.ts` | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m3](../board-m3/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M2 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims cross-device persistence of saved views, Firefox or WebKit behavior beyond Chromium, or validation with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
