# Trace: Let Codex checks run on a default Mac install

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| CL-01 A login directory holding app binaries over the byte budget hashes. | `checker.go` hashFile, `fileid_*.go` | `TestProtectedLoginHashNamesLargeFilesByIdentity`, `TestProtectedLoginHashOverBudgetTrees` | implemented and tested |
| CL-02 A change to such a file still changes the hash. | same | same-size rewrite with restored mtime case | implemented and tested |
| CL-03 A run refused before start is failed with its reason, not outcome unknown. | `daemon.go` completion containment | `TestRunRefusedBeforeStartReportsNoProcess` | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Codex check on a default macOS install (the Codex app keeps its own CLI binary under `~/.codex/plugins/`) hashes the login directory and runs; a run refused before its process starts is recorded as failed with its reason and can be requeued, never held as outcome unknown; daemon tests pass apart from the sandbox tests this container cannot run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
