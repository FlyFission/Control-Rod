# Trace: Plannotator pattern note

| Requirement | Where | Check | Disposition |
|---|---|---|---|
| N-1 Each item names its source in Plannotator at the pinned commit. | `docs/patterns/plannotator.md`, "Seen in" column | Paths checked against the scratch clone (E-01) | done |
| N-2 Each item names where it would land in Control Rod and its decision. | "Lands in" and "Decision" columns | Self-check (E-01) | done |
| N-3 Each item that touches a trust surface names its gate. | "Gate" column | Self-check against AGENTS rule 2 (E-01) | done |
| N-4 Ideas only; no copied code, configuration or wording. | Whole note | Not yet checked by someone other than the author | open: review |
| PL1 to PL11 implementations | none | none | not in this change |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pattern note `docs/patterns/plannotator.md` is complete, each item has a decision, and the owner has reviewed it. No product code is part of this change; no behavior claim is made about Control Rod.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
