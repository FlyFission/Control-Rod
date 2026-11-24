# Risk: Let Codex checks run on a default Mac install

- **Mode:** Standard
- Execution owner: Claude (project thread "Fix Codex checker runs failing on Mac").
- Decision owner: Ben Huffer. No trust surface is edited (`daemon/internal/runner` is not a kernel decision function).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A checker rewrites a large protected file and the identity misses it. | Change time moves on every write, truncate, rename-over and utimes, and cannot be set back without root; inode and device catch replacement. The login directory is also mounted read-only for the checker (first layer). Test rewrites a large file with the same size and restores its modification time. | Any way a non-root process edits a file without moving its change time. |
| R-02 | The Codex app updates its bundled CLI while a check runs, and the check is voided. | Fails safe: the check says the login instructions or settings changed and does not count. Rare (app updates). | Owner reports repeated voids from app updates. |
| R-03 | A run that did start is reported as not started. | `cmd.Process` is set by exec only once a process exists; any started run keeps its receipt path. Test fails without the fix. | A started run reported with containment none. |
| R-04 | Large walks slow each check. | Identity costs one stat; content reading stays inside the 100 MB budget; walk capped at 200,000 entries. | Hash time over a few seconds on a real install. |

## Selected mode

- **Mode:** Standard
- Basis: daemon-only, reversible by revert, no data or wire format change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Codex check on a default macOS install (the Codex app keeps its own CLI binary under `~/.codex/plugins/`) hashes the login directory and runs; a run refused before its process starts is recorded as failed with its reason and can be requeued, never held as outcome unknown; daemon tests pass apart from the sandbox tests this container cannot run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
