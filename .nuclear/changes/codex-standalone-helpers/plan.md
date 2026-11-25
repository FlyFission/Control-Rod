# Plan: Codex's standalone install keeps its helper programs when staged

1. `codexRelease` in artifact.go: a native `codex` whose folder holds at least one `codex-*` file, and nothing besides `codex` and `codex-*` regular files, resolves to that folder (Root) with a tree digest. StageArtifact already copies a tree.
2. Test `TestStandaloneCodexKeepsItsHelpersWhenStaged`: helpers are in the staged copy, a changed helper changes the digest, and a shared folder stays a single file.
3. macOS Codex checker: disposable CODEX_HOME at `<workspace>.codexhome` with a copy of auth.json, denied to the agent's commands; no `--ephemeral` for that checker only; models read from the rollout (`PostRunModels`, `addPostRunModels`) in RunCheck and the daemon job path; refreshed sign-in written back when the host file is unchanged (`SaveRefreshedCredential`); stale homes removed. Admission rule `ephemeralOrIsolated`.
4. Tests: codex_rollout_test.go (rollout parsing, observed set, ephemeral switch, admission, write-back, stale cleanup) and the opt-in `TestRealCheckerOnThisMac` (CONTROLROD_REAL_CHECKER=codex) for the Mac test set.
5. docs/daemon.md.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A native Codex whose folder holds only codex and codex-* helpers is staged with them, and a shared bin folder stays a single file. A macOS Codex checker uses a disposable CODEX_HOME, keeps a refreshed sign-in, and names its model from its session rollout. A real Codex check on the owner's Mac ends with a verdict (TestRealCheckerOnThisMac). Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
