# Ship: Plain names on the board, one way to add work, a shorter Setup

Release decision: **approved by the owner, 2026-11-25 00:56 UTC.**

## Signature

Owner (sole maintainer): Ben Huffer, yes, by decision card "Merge PR 194 (plain board names, one add button, shorter Setup) into main?" in the project thread, 2026-11-25 00:56 UTC. Blind check: Codex on the owner's Mac (static, four minor findings; three fixed, one deferred, as recorded in verification.md).

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: a fresh install shows the Software board columns as Ready, Agent working, Being checked, Needs a reviewer, Ready to accept; Setup lists runnable agents and one "Coming later" line.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The Software board names its columns in plain words; the board offers one New change button and a secondary Quick add; Setup lists the agents Control Rod can run, found or not, with their install commands visible, and names the ones coming later in one line. Web tests, typecheck and the live lifecycle pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
