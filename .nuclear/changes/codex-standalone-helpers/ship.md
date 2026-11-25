# Ship: Codex's standalone install keeps its helper programs when staged

Release decision: **merge on green** under the owner's standing permission (2026-11-25, through 2026-12-02).

- Rollback: revert the merge. No migration.
- Monitoring after merge: a Codex pre-check on macOS can run tools, writes a verdict, and the card moves to accept.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A native Codex whose folder holds only codex and codex-* helpers is staged with them, and a shared bin folder stays a single file. A macOS Codex checker uses a disposable CODEX_HOME, keeps a refreshed sign-in, and names its model from its session rollout. A real Codex check on the owner's Mac ends with a verdict (TestRealCheckerOnThisMac). Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
