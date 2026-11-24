# Plan: Let Codex checks run on a default Mac install

1. Read `hashProtected`, the pre-start and settle hashes (`daemon.go`, `check.go`, `checker.go`), and how the API and web treat containment.
2. Identity fallback for large protected files (`fileid_{darwin,linux,other}.go`), separate entry cap.
3. Containment `none` for a command that never started.
4. Tests: a CodexCLI.app-sized binary hashes, stays stable, and a same-size rewrite with the modification time put back changes the hash; over-budget cases; a run refused before start reports no process (fails without the fix).
5. Draft PR, Codex blind check on the owner's Mac.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Codex check on a default macOS install (the Codex app keeps its own CLI binary under `~/.codex/plugins/`) hashes the login directory and runs; a run refused before its process starts is recorded as failed with its reason and can be requeued, never held as outcome unknown; daemon tests pass apart from the sandbox tests this container cannot run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
