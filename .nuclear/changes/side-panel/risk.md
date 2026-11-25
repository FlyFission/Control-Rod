# Risk: Show details in a side panel instead of windows

- **Mode:** Standard
- Execution owner: Claude (project thread "Replace pop-up windows with a side panel").
- Decision owner: Ben Huffer. No trust surface is edited.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Opening the panel remounts the page (scroll, filters, drafts lost). | The page always sits in the same `Group`/`Panel`; only the side panel mounts. Rendered check. | A page remount on open. |
| R-02 | A window crossing the breakpoint loses a typed note. | One slot element moved by `appendChild`, never recreated. Unit test and rendered check. | Typed text lost on resize. |
| R-03 | The docked panel squeezes the page unusably. | Docks only from 1180 px; page keeps at least 420 px; panel 380 to 960 px. | Page under 420 px beside the panel. |
| R-04 | Close behaviour changes surprise people. | X and Esc unchanged; outside click still closes when the panel covers the page; beside the page it stays, which is the point of the change. | Owner objects. |
| R-06 | A file viewer runs content from an agent's output (scripts, links). | Markdown renders no raw HTML and keeps only web, mail and in-page links; Word output loses scripts, frames and non-web links; Shiki escapes code; PDFs render in pdf.js's worker. Unit tests. | Script or javascript: link reaching the page. |
| R-07 | Viewer libraries weigh down the app. | Each viewer is a lazy chunk loaded on first use; Shiki uses its JavaScript engine (no WebAssembly) and fetches one grammar at a time. | Main bundle growth above 50 kB gzip. |
| R-08 | Opening cards in the panel hides the case page people used to land on. | Every card link stays a real link: Cmd/Ctrl-click or a new tab opens the case page, and the panel has "Open the full case". | Owner objects. |
| R-05 | Saved width junk. | Clamped on read and write, junk falls back to 520. Unit tests. | An out-of-range width taking effect. |

## Selected mode

- **Mode:** Standard
- Basis: web-only presentation change, per-viewer storage, reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: clicking a card, capture or inbox item, or a card link anywhere in the app, opens its details in one side panel; on a wide screen it sits beside the page (resizable, width kept per person) and the page stays usable; narrower it slides over the page and a click outside closes it; X and Esc hide it; an output file (markdown, PDF, Word, code, CSV, image, diff, JSON) or a run's full log opens at the panel's full size over the card, with Back and Esc returning to the card; crossing the breakpoint keeps what was typed; web tests, typecheck, build and the rendered checks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
