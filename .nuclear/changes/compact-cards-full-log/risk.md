# Risk: Compact cards, a full-screen run log, and splits explained

- A compact card could hide that a card needs the owner. Mitigation: the status mark (the same symbol and tone colour as the comfortable card) stays on the line, the words are in the tooltip and read by screen readers, and the Needs you count in the header is unchanged.
- The full log renders every line as a DOM row. A very long log could be slow. Logs are already capped by the runner's log limit; the filter narrows what is drawn.
- The intake wording changes how agents draft. It can only reduce splits; it does not change the package contract or validation.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: web and brief-wording change, reversible by revert, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A compact card is one line: a status mark and its name. A run log opens full screen with every line, a filter and copy. A card drafted from a request that became several cards says "Card N of M from one request" with the request. Intake keeps one card unless the work truly splits. Web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
