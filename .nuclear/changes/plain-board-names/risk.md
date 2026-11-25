# Risk: Plain names on the board, one way to add work, a shorter Setup

- Renamed labels could break someone's habits or a screen-reader script. They are display strings only; ids, keyboard shortcuts and logic are unchanged.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: web-only change, reversible by revert, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The Software board names its columns in plain words; the board offers one New change button and a secondary Quick add; Setup lists the agents Control Rod can run, found or not, with their install commands visible, and names the ones coming later in one line. Web tests, typecheck and the live lifecycle pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
