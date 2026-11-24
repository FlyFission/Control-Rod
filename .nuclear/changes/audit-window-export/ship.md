# Ship: audit export for a time window

Release decision: **approved by the owner's recorded yes (see Signature) to merge #110; no release is authorized by this record.**

- **Proposed:** merge the export operation, route, offline check, Records page form, tests and documentation.
- **Not claimed:** that the chain is witnessed, that event times come from an independent clock, or any compliance or certification.

## Signature

| Field | Entry |
|---|---|
| Decision | Approve: merge pull request #110, which adds `recordsExport` to `spec/api.tsp` |
| Question | "Should I merge PR #110? It changes the repo's trust rules: it adds one new operation, `recordsExport`, to `spec/api.tsp`. A plain "yes" here is enough, and I'll record it in the change record." Asked in the Claude project thread at 2026-11-21 12:53 PM ET (17:53 UTC), with a link to #110 |
| Answer | "Yes", Ben Huffer, project owner and sole maintainer, in the same Claude project thread at 2026-11-21 1:07 PM ET (18:07 UTC) |
| Head when asked | fbe4462 (CI green); the only file changed after the yes is this record (`ship.md`, `trace.md`), which is not a trust surface |
| Recorded by | The implementing agent, from the chat message. Ben Huffer did not write this entry, and no signature or initials were typed for him |

Rollback: revert the commit. A read-only operation; no schema or state change.

Monitoring after merge: package-proof and export tests in `seals.test.ts`; any change to `at` or the event digest re-opens R-03.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`GET /records/export?from&to` returns every event recorded in a half-open time window inside the chain from its first event, under the first valid seal covering the window's last event, checkable offline by `pnpm cr verify` through `verifyWindow`; the Records page exports and downloads it; package proofs behave as before; tests cover it; CI is green; the owner's recorded yes covers the `spec/` change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
