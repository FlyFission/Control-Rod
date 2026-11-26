# Ship: A check counts when the stream names the dated snapshot of the pinned model

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread on 2026-11-25 at 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. No trust surface is touched.

- Rollback: revert the merge. No data, route or migration change.
- Monitoring after merge: after the next `controlrod update`, a Claude check's verdict counts.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A check whose stream names the pinned model and its dated snapshot (<id>-YYYYMMDD) counts, in the daemon and the server alike; a shorter alias, a different model, a malformed date, or a stream that never names the pinned id are still provenance unknown. Go and API tests pin both sides, and typecheck and vet pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
