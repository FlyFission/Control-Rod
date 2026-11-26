# Ship: Claude checks on a Mac can reach their model (DNS in the sandbox)

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread 2026-11-25 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. No trust surface is touched.

- Rollback: revert the merge. No data, route or migration change.
- Monitoring after merge: after the next `controlrod update`, a Claude check on a Mac reaches its model and writes its verdict.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Claude checker resolves host names inside its Seatbelt sandbox: the profile still denies every outbound Unix socket except /private/var/run/mDNSResponder. A darwin test resolves a real host name under the profile, a profile test pins the single allow, and Go vet (linux, darwin) and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
