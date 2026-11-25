# Risk: Refresh the README and website tour screenshots

- Pictures are binary and reviewed by eye; a wrong picture misleads readers but changes no behaviour.
- The status-line fallback only changes text for a role the web does not know.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: docs pictures, alt text and a one-word fallback; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README and website tour pictures come from the current main (plain column names, calm drawer, resizable rail, one SCRAM button), the board alt text names the columns the picture shows, and no card reads "undefined running". The shots spec, site tests and web lib tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
