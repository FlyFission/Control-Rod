# Plan: board redesign slice M2, lenses

1. `apps/web/src/lib/lenses.ts`: define `Lens`, `DEFAULT_LENS`, `parseLens`, `lensToQuery`, `writeLensToUrl`, `isProtected`, `applyLens`, `revealHidden`, `edgeColor`, and `legendEntries`. Person, agent, and state edge palettes are fixed in cool blue / cyan / indigo / violet / slate tones away from the fixed meaning tokens (`--needs`, `--check`, `--stuck`, `--done`), and `edgeColor` never returns a meaning token.
2. `apps/web/src/features/board/savedViews.ts`: define `SavedView`, `viewsStorageKey(user)` (`cr.views.<user>`), `loadViews(user)`, `saveView(v, user)`, and `deleteView(name, user)` with graceful fallback to `[]` on missing, invalid, or blocked storage.
3. `apps/web/src/features/board/LensBar.tsx`: render real buttons and selects with `aria-pressed` for kind (`All`, `Code`, `Documents` with counts), `Needs you`, `Mine`, `Color by`, `Group by`, `Density` (`Comfortable`, `Compact`), and saved view selector / save / delete.
4. `apps/web/src/features/board/useBoardData.ts`: expose `me` (signed-in `session.user`) and `projects` (project id-to-name map from `admin.projects`).
5. `apps/web/src/features/board/Card.tsx`, `BoardView.tsx`, `board.css`: sync `lens` with `window.location.search`, compute `applyLens` and render the default-view guard banner (`N waiting on a signature is/are hidden by this view` with `Show` calling `revealHidden`), render swimlanes when `groupBy !== "none"`, pass `edgeColor` and `compact` to `Card` (hiding avatars and grade/nuclear chips while always keeping the next line), wire the header `Needs you` count button to toggle `lens.needs`, and render the active color legend below the board.
6. Tests: `apps/web/src/lib/lenses.test.ts`, `apps/web/src/features/board/LensBar.test.tsx`, `apps/web/src/features/board/board.test.tsx` (M2 integration tests), and `apps/web/e2e/board-looks.spec.ts` (axe scan in looks a, b, and c with swimlanes, colorBy, compact density, and the guard banner).
7. Evidence: web typecheck, full web test suite, web build, and Chromium board axe run under `evidence/`.

## Interfaces as built

`Lens`, `DEFAULT_LENS`, `parseLens(q: URLSearchParams): Lens`, `lensToQuery(l: Lens): string`, `writeLensToUrl(lens: Lens): void`, `isProtected(c: BoardCard): boolean`, `applyLens(cards: BoardCard[], l: Lens, me: string): { shown: BoardCard[]; hiddenProtected: number }`, `revealHidden(l: Lens): Lens`, `edgeColor(c: BoardCard, l: Lens): string`, `legendEntries(cards: BoardCard[], lens: Lens, columnTitles?): LegendEntry[]`, `SavedView`, `loadViews(user?: string): SavedView[]`, `saveView(v: SavedView, user?: string): void`, `deleteView(name: string, user?: string): void`, `<LensBar />`, `BoardData.me`, `BoardData.projects`, `CardProps.edgeColor?`, `CardProps.compact?`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m3](../board-m3/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M2 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims cross-device persistence of saved views, Firefox or WebKit behavior beyond Chromium, or validation with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
