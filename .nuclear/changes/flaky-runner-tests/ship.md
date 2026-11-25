# Ship: Fix the flaky daemon runner tests in CI

Release decision: **merge** when CI is green. The owner chose "Merge when CI is green" in the project thread on 2026-11-25 at 03:41 UTC, after Codex round 2 said MERGE (verification E-06) and its two P3s were fixed. No trust surface is touched. 

## Signature

Owner (sole maintainer): yes to merge when CI is green, recorded in the project thread on 2026-11-25.

- Rollback: revert the merge.
- Monitoring after merge: the Go job stops failing with "never entered scope" and "never seen executing the verified runtime".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Ending: a run whose process exits at once is located in its scope even after systemd has collected that scope, so it is not stopped as uncontained after five seconds; the runtime-confirmation tests launch a stand-in runtime that keeps running whatever the host's sleep is; the old failures reproduce on main and pass with the change, under load, with no new failure in the Go suite.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
