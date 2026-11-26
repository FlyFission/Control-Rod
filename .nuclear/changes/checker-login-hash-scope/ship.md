# Ship: A check is not voided when another agent run writes the shared login folder

Release decision: **merge on green** under the owner's standing permission (2026-11-25, through 2026-12-02).

- Rollback: revert the merge. No migration.
- Monitoring after merge: Claude and Codex checks on the owner's Mac are no longer voided with "login instructions or settings changed" while other runs start.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The protected-login hash is compared only for a checker that could write its real login folder (self-confined, no disposable home). Mounted Claude and Codex checkers on Linux and macOS, and macOS Codex checkers with their own home, are not compared. Grok and Antigravity still are. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
