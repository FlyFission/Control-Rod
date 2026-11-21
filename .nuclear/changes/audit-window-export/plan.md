# Plan: audit export for a time window

1. Add `recordsExport` to `spec/api.tsp`; regenerate with `pnpm spec`.
2. Split the package proof's segment-link and seal-coverage checks into shared helpers; add `windowEvents`, `windowProblem`, `verifyWindow` and `windowExport`; route `GET /records/export`.
3. Teach `pnpm cr verify` to read an export.
4. Add the export form to the Records page.
5. Tests: API (export, refusals, offline check, moved time), offline check unit tests, Records page test; run the full API suite.
6. Update the auditor's guide, crosswalk and status.
7. Ask the owner for a recorded yes on the `spec/` change; record it in `ship.md`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`GET /records/export?from&to` returns every event recorded in a half-open time window inside the chain from its first event, under the first valid seal covering the window's last event, checkable offline by `pnpm cr verify` through `verifyWindow`; the Records page exports and downloads it; package proofs behave as before; tests cover it; CI is green; the owner's recorded yes covers the `spec/` change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
