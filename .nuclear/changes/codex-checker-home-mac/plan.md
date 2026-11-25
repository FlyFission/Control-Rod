# Plan: Codex checks run on a Mac again: a login home of their own

1. `prepareIsolatedLoginHome` (checker.go): `<CheckerTmp>/isolated-home` with a 0600 copy of the sign-in. It sets the runtime's isolated-home variable (CODEX_HOME) and records a `credentialCopy`.
2. `checkerMountArgv` (darwin): for a runtime with an isolated home, use it, and do not make the host sign-in writable. Others are unchanged.
3. `Workspace.SaveRefreshedCredential`: after the run, before CheckerTmp is removed (daemon.go, check.go), save a refreshed sign-in back by rename, only when it changed, is valid JSON, and the host still matches the copy.
4. Tests: `TestSaveRefreshedCredentialOnlyWhenSafe` (all platforms); `TestSeatbeltCodexCheckerGetsAWritableHomeOfItsOwn` (macOS, platforms workflow).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On macOS a Codex pre-check runs with CODEX_HOME in its own per-run temporary directory, holding a copy of the sign-in. The real login folder, sign-in file included, is never writable during the check. A refreshed sign-in is saved back only when it changed, is valid JSON, and the host file still holds what was copied in. Go vet (linux, darwin) and the runner tests pass; the darwin tests run in the platforms workflow.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
