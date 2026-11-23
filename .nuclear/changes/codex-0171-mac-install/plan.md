# Plan: first macOS install fixes

1. Capture Codex 0.171.0's feature list as test data and show the preflight test fails.
2. Classify each of the nine from `codex-rs/features` at rust-v0.171.0 and add them to `CodexSafeFeatures`. (When this landed, #156 had already put the same nine into `CodexSafeFeatures` without a recorded reason; this change supplies the per-feature classification, a note at the list, and the test against the captured `codex features list`.)
3. Add `controlrod runtimes` and call it from `pnpm cr doctor`.
4. Quiet the startup log.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

MI-01 to MI-03 are implemented; MI-01 fails first on the captured Codex 0.171.0 feature list, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
