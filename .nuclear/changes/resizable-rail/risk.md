# Risk: Make the sidebar resizable and collapsible

- **Mode:** Standard
- Execution owner: Claude (project thread "Make the sidebar resizable and collapsible").
- Decision owner: Ben Huffer. No trust surface is edited.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The resize handle steals clicks or focus from the workspace. | Hit area only at the rail's edge; rendered check clicks 24 px right of the edge and the Search button. | A click in the workspace that grabs the handle. |
| R-02 | A hidden rail still takes keyboard focus. | The rail is `inert` while hidden; rendered check tabs after hiding. | Focus inside the hidden rail. |
| R-03 | A saved width makes the app unusable (too wide, junk in storage). | Clamped to 200 to 480 px on read and write; junk falls back to the default; the workspace keeps at least 360 px. | A saved value outside the clamp taking effect. |
| R-04 | `[` fires while typing or under a dialog. | Same guards as the other single keys (fields, open dialogs, the single-key switch). Test. | `[` toggling inside a field. |
| R-05 | New dependency: license and bundle weight. | react-resizable-panels 4.22.1, MIT, 11 days old at install; license gate passes; main bundle grows about 16 kB gzip. | License gate failure or growth above 50 kB gzip. |
| R-06 | Unit tests run against a stand-in for the library, not the library. | The stand-in is only for jsdom (no layout); the real library is exercised by the rendered check in Chromium (`evidence/rail-check.js`). | A behaviour the rendered check does not cover. |

## Selected mode

- **Mode:** Standard
- Basis: web-only presentation change, per-viewer storage, reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: on a wide screen the navigation rail can be dragged wider (up to 480 px) or narrower (down to 200 px), hidden and shown again from the top bar or with `[`, and keeps each person's width and hidden state across reloads; long project names wrap to two lines and show in full on hover; the phone layout is unchanged; web tests, typecheck, build, license gate and the rendered check pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
