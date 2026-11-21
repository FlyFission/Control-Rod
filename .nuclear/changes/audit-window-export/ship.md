# Ship: audit export for a time window

Release decision: **proposed merge, held for the owner's recorded yes on the `spec/` change.**

- **Proposed:** merge the export operation, route, offline check, Records page form, tests and documentation.
- **Not claimed:** that the chain is witnessed, that event times come from an independent clock, or any compliance or certification.

## Signature

| Field | Entry |
|---|---|
| Decision | Approve: merge pull request #110, which adds `recordsExport` to `spec/api.tsp` |
| Question | Not yet asked |
| Answer | Pending |
| Head when asked | Pending |
| Recorded by | The implementing agent will fill this from the owner's own words. No signature or initials will be typed for the owner |

Rollback: revert the commit. A read-only operation; no schema or state change.

Monitoring after merge: package-proof and export tests in `seals.test.ts`; any change to `at` or the event digest re-opens R-03.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`GET /records/export?from&to` returns every event recorded in a half-open time window inside the chain from its first event, under the first valid seal covering the window's last event, checkable offline by `pnpm cr verify` through `verifyWindow`; the Records page exports and downloads it; package proofs behave as before; tests cover it; CI is green; the owner's recorded yes covers the `spec/` change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
