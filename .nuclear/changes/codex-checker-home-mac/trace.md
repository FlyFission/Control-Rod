# Trace: Codex checks run on a Mac again: a login home of their own

| Need | Change | Evidence |
| --- | --- | --- |
| Codex can write its runtime state | `prepareIsolatedLoginHome`, darwin `checkerMountArgv` | `TestSeatbeltCodexCheckerGetsAWritableHomeOfItsOwn` |
| The real login folder stays unwritten | host sign-in no longer in the Seatbelt allow-list | same test (R:1, no file written) |
| A refreshed sign-in is kept, and only safely | `SaveRefreshedCredential` | `TestSaveRefreshedCredentialOnlyWhenSafe` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check runs with CODEX_HOME in its own per-run temporary directory, holding a copy of the sign-in. The real login folder, sign-in file included, is never writable during the check. A refreshed sign-in is saved back only when it changed, is valid JSON, and the host file still holds what was copied in. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
