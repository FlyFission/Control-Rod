# Ship: agent update prompt

Release decision: **pull request for owner review; no merge or release is authorized by this record.**

- **Proposed:** merge to main.
- **Not claimed:** no real `npm install` was run in tests; the panel was tested in jsdom, not a real browser; API tests ran on PostgreSQL 16.

Rollback: revert the commits. The contract additions are optional fields and one new route; an older daemon or app ignores them. Settings rows `agent_updates` and `agent_update_requests` can stay.

Monitoring after merge: reports of a wrong version comparison or a command offered for a non-npm install.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-07 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
