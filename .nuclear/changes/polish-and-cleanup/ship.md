# Ship: Polish and cleanup from the November review (batch 10)

Release decision: **pending**. Merging is the owner's decision.

- Rollback: revert the merge. No data or migration. A setup-code file left behind is removed at the next start once a passkey exists.
- Monitoring after merge: a fresh install prints a setup code and the sign-in page asks for it; the Records page shows "Show older entries" past 500 entries.
- Limits: tested in a Linux cloud container, not on macOS. The setup code was not tried in a real browser with a real passkey; the tests use a virtual authenticator.
## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each finding in batch 10 of the 2026-11-28 review is fixed, already fixed on main, logged with a reason, or covered by another batch. The first passkey needs the setup code the server printed. Web, API and daemon typecheck and the related tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
