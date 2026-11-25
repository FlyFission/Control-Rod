# Ship: Let Codex checks run on a default Mac install

Release decision: **merge.** The owner chose "Merge it now" in the project thread on 2026-11-25 at 00:37 UTC. Three Codex blind rounds (verification E-03 to E-05); every finding is fixed, the last by removing tmpfs from the identity allowlist.

## Signature

Owner (sole maintainer): yes to merge, recorded in the project thread on 2026-11-25.

- Rollback: revert the merge. No data, route or migration.
- Monitoring after merge: the owner's next Codex check on his Mac starts and reports a verdict.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Codex check on a default macOS install (the Codex app keeps its own CLI binary under `~/.codex/plugins/`) hashes the login directory and runs; a run refused before its process starts is recorded as failed with its reason and can be requeued, never held as outcome unknown; daemon tests pass apart from the sandbox tests this container cannot run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
