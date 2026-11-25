# Plan: evidence payloads out of git

1. Measure `.nuclear` before adding this record. The commands and their output are in `proposed-adr.md`.
2. Add `verifyEvidenceRecord` and dispatch a record directory from `pnpm cr verify`. Test the three outcomes.
3. Add `tools/check_evidence_manifest.py`. Existing records pass. A manifest with a digest and no payload passes. A cited missing file without a manifest fails.
4. Write the ADR as `proposed-adr.md` in this record. Do not copy it to `docs/adr/` until the owner records a yes naming that directory, and confirms or replaces the store recommendation.
5. Do not rewrite history. Do not wire the checker into `.github/workflows/ci.yml` without a separate yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. The three verify outcomes are tested.
2. The convention check matches the grandfathering rule.
3. The ADR file is not in `docs/adr/`.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
