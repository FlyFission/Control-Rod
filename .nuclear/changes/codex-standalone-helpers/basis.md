# Basis: Codex's standalone install keeps its helper programs when staged

After #228, the owner's Mac ran a Codex pre-check (2026-11-25, R-e0c6c4be). Codex started, signed in and read the task, but every tool call failed with "failed to spawn code-mode host .../controlrod-runtimes-501/<digest>/codex-code-mode-host: host executable was not found". Codex 0.172's standalone install, ~/.codex/packages/standalone/releases/0.172.0-aarch64-apple-darwin/bin/, holds codex, codex-code-mode-host and codex-exec-server. Codex starts the helpers from beside itself. Control Rod staged codex alone, because a native binary on the PATH was treated as a single file. The npm layout was already staged as a tree.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A native Codex whose folder holds only codex and codex-* helpers resolves to that folder as one artifact. Its digest covers every helper, and the staged copy includes them. A shared bin folder still resolves to the single file. The npm layout is unchanged. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
