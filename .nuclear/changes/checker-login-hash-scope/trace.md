# Trace: A check is not voided when another agent run writes the shared login folder

| Need | Change | Evidence |
| --- | --- | --- |
| Other runs' writes do not void a mounted check | `checkerLoginRoot` | `TestOnlyACheckerThatCanWriteItsLoginIsCompared` |
| A mounted checker still cannot write its login | unchanged mount | `checker_linux_test.go` login read-only test; `checker_darwin_test.go` |
| Self-confined checkers are still compared | `checkerLoginRoot` | same test (Grok) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The protected-login hash is compared only for a checker that could write its real login folder (self-confined, no disposable home). Mounted Claude and Codex checkers on Linux and macOS, and macOS Codex checkers with their own home, are not compared. Grok and Antigravity still are. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
