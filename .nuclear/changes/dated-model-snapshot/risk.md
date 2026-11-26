# Risk: A check counts when the stream names the dated snapshot of the pinned model

- Provenance still requires the pinned id itself in the stream. The added match is exact: the id, a hyphen, then eight digits. A shorter alias, a sibling model (for example a -mini) and any other model remain refused, as the tests show.
- The model registry is unchanged. No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A check whose stream names the pinned model and its dated snapshot (<id>-YYYYMMDD) counts, in the daemon and the server alike; a shorter alias, a different model, a malformed date, or a stream that never names the pinned id are still provenance unknown. Go and API tests pin both sides, and typecheck and vet pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
