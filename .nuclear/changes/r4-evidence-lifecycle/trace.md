# Trace: evidence payloads out of git

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| R401-1 | `pnpm cr verify` reports incomplete, verified, or tampered, and does not say verified for a missing or mismatched payload. | E-01 | done |
| R401-2 | Existing records pass the convention check. A manifest with a digest and no payload passes. A cited missing file without a manifest fails. | E-02 | done |
| R401-3 | No file under `docs/adr/` is added or edited. The proposed ADR names the store constraint and does not type a retention period. | E-03 | done |
| R401-4 | The before measurement of `.nuclear` is the command output, not a typed figure. | E-04 | done |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. Each row above has an evidence ID that verification records.
2. The disposition matches what the evidence shows.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
