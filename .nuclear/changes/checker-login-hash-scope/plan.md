# Plan: A check is not voided when another agent run writes the shared login folder

1. `checkerLoginRoot(a, ws)`: empty (nothing compared) unless the checker is self-confined and has no disposable login home. RunCheck and the daemon job path use it in place of `loginRoot`.
2. Test `TestOnlyACheckerThatCanWriteItsLoginIsCompared`: Claude is not compared, Codex with its own home is not compared, and Grok is.
3. docs/daemon.md: one paragraph.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The protected-login hash is compared only for a checker that could write its real login folder (self-confined, no disposable home). Mounted Claude and Codex checkers on Linux and macOS, and macOS Codex checkers with their own home, are not compared. Grok and Antigravity still are. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
