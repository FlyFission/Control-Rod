# Risk: Fewer steps on a new card

- A card now reaches intake with no explicit per-card choice. Mitigation: the lane is the project's default, which a person with lane authority set; the quick-add row names the lane and what it means; raising stays one click in the drawer.
- A project left on Internal sends new cards to cloud agents. That was already the default in New work and project create.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: web-only change, reversible by revert, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Adding a card is one step: it takes the project's default data lane with no Classify step; the project bar sets that default; a card's drawer says what its lane means and can raise it; a card in work no longer reads "Needs you: Return for revision" when nothing is asked; web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
