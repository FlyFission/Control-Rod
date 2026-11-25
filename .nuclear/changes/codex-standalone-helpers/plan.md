# Plan: Codex's standalone install keeps its helper programs when staged

1. `codexRelease` in artifact.go: a native `codex` whose folder holds at least one `codex-*` file, and nothing besides `codex` and `codex-*` regular files, resolves to that folder (Root) with a tree digest. StageArtifact already copies a tree.
2. Test `TestStandaloneCodexKeepsItsHelpersWhenStaged`: helpers are in the staged copy, a changed helper changes the digest, and a shared folder stays a single file.
3. docs/daemon.md: one sentence.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A native Codex whose folder holds only codex and codex-* helpers resolves to that folder as one artifact. Its digest covers every helper, and the staged copy includes them. A shared bin folder still resolves to the single file. The npm layout is unchanged. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
