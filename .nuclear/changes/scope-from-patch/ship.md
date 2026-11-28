# Ship: Scope drift and Plant bays use the files a patch changes

Release decision: **pending** (merge on green under the owner's standing merge-on-green permission for this repository, valid to 2026-12-02).

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: a checkout card's second round reports repository files (or nothing) as drift, and an untagged software card sits in the bay its patched files match.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a checkout card, scope drift names the repository files whose change differs between author rounds (never `changes.patch` or `RESPONSE.md`), and the Plant places the card by the files its patch touches. Cards whose deliverables are the files themselves behave as before. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
