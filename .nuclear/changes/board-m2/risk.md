# Risk: board redesign slice M2, lenses

- **Mode:** Standard
- Execution owner: Antigravity subagent on branch `feat/board-m2-lenses`.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow, or spec change. All changes are inside `apps/web`, `docs/status.md`, and this packet.
- Scope: `apps/web/src/lib/lenses.ts`, `apps/web/src/features/board/` (`LensBar.tsx`, `savedViews.ts`, `BoardView.tsx`, `Card.tsx`, `useBoardData.ts`, `board.css`, tests), `apps/web/e2e/board-looks.spec.ts`, `docs/status.md`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A filter or saved view silently hides cards waiting on a person verification or a signature, causing missed safety or acceptance gates. | `applyLens` counts every hidden card in `person-verifies` or `needs-signature`; whenever `hiddenProtected > 0`, `BoardView` renders the guard banner with a `Show` button calling `revealHidden(lens)`, clearing `kind`, `needs`, and `mine` while keeping presentation fields. Tested per filter, combined, and from a saved view. | Any active filter hides a `person-verifies` or `needs-signature` card without displaying the guard notice and `Show` control. |
| R-02 | A color lens reuses a fixed meaning color (`--needs`, `--check`, `--stuck`, `--done`), confusing card category or owner with gate/block status. | `edgeColor` and `legendEntries` use `--kind-code`, `--kind-doc`, `--line-2`, and cool blue/cyan/indigo/violet/slate hex palettes; unit test loops over all `colorBy` modes and asserts none return a meaning token. | `edgeColor` returns `var(--needs)`, `var(--check)`, `var(--stuck)`, or `var(--done)`. |
| R-03 | Compact density hides the card's next line or independent check signal, obscuring what a person must do next. | Compact density hides only `.bd-avatar`, `.bd-chip`, and `.bd-nuclear` while always rendering the next line and the `Independent check` tag; tested in `board.test.tsx`. | A card's next line is hidden or omitted in compact density. |
| R-04 | Browser storage errors, private mode, or malformed JSON break the board or leak saved views across signed-in members. | `savedViews.ts` scopes keys to `cr.views.<user>`, wraps reads/writes in `try/catch`, sanitizes parsed `Lens` fields, and falls back to `[]`; tested in `LensBar.test.tsx`. | `loadViews`, `saveView`, or `deleteView` throws on storage failure or mixes views between two users. |
| R-05 | Lens controls or new CSS rules violate WCAG 2.2 AA contrast, type scale, or keyboard accessibility. | Controls use real `<button>` and `<select>` elements with `aria-pressed` and `<label>`; `contrast.test.ts`, `type-scale.test.ts`, and `board-looks.spec.ts` (axe-core across looks a, b, c) enforce compliance. | Any contrast, type-scale, or axe violation on the board in looks a, b, or c. |
| R-06 | URL query parameters fail to parse safely or drop unrelated query state. | `parseLens` validates every field against allowlists with `DEFAULT_LENS` fallback; `writeLensToUrl` replaces only lens keys while preserving unrelated params and hash; tested in `lenses.test.ts` and `board.test.tsx`. | Malformed `?kind=...` breaks rendering or `writeLensToUrl` strips unrelated URL parameters. |

## Selected mode

- **Mode:** Standard
- Basis: user-visible filtering, grouping, URL state, and safety-critical default-view guard on the home board; no contract or protected surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m3](../board-m3/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M2 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims cross-device persistence of saved views, Firefox or WebKit behavior beyond Chromium, or validation with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
