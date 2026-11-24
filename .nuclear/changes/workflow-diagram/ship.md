# Ship: Show each workflow as a flow diagram

Release decision: **none yet.** Waiting for the owner's review of the screenshots and the Codex blind check.

- Rollback: revert the merge. No data, route or migration.
- Overlaps: draft PR #171 adds `/control-room` near the same router and places lines (trivial rebase); draft PR #170 adds `omp` to `AgentId`, which then needs a mark entry (initial shown until then).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Setup and a new Workflow place draw the person's current workflow as a block flow diagram and as a decision matrix, from the same seats, readiness and check-in answer the dispatcher and Setup read; each agent shows its own mark; nothing unbuilt is drawn as in force; web tests, typecheck, build and the license gate pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
