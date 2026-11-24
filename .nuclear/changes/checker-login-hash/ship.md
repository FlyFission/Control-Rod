# Ship: Let Codex checks run on a default Mac install

Release decision: **pending** the Codex blind check and the owner's yes.

## Signature

Owner (sole maintainer): pending.

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: the owner's next Codex check on his Mac starts and reports a verdict.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Codex check on a default macOS install (the Codex app keeps its own CLI binary under `~/.codex/plugins/`) hashes the login directory and runs; a run refused before its process starts is recorded as failed with its reason and can be requeued, never held as outcome unknown; daemon tests pass apart from the sandbox tests this container cannot run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
