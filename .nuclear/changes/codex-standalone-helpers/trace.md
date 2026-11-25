# Trace: Codex's standalone install keeps its helper programs when staged

| Need | Change | Evidence |
| --- | --- | --- |
| Codex finds its helpers when staged | `codexRelease` | `TestStandaloneCodexKeepsItsHelpersWhenStaged` |
| A changed helper is a changed artifact | tree digest | same test |
| A shared bin is not taken in | entry filter | same test |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A native Codex whose folder holds only codex and codex-* helpers resolves to that folder as one artifact. Its digest covers every helper, and the staged copy includes them. A shared bin folder still resolves to the single file. The npm layout is unchanged. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
