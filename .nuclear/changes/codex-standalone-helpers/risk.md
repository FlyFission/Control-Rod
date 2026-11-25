# Risk: Codex's standalone install keeps its helper programs when staged

- **Identity.** The digest now covers the helpers too, so a swapped helper is caught, which it was not before. Unpinned runs use the probe's digest, which goes through the same resolution, so no pin breaks.
- **Scope.** Only a folder holding nothing but codex files is taken in. A shared bin (Homebrew, /usr/local/bin) stays a single file.
- **No trust surface is touched.**

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert; no kernel, policy, spec or workflow change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A native Codex whose folder holds only codex and codex-* helpers resolves to that folder as one artifact. Its digest covers every helper, and the staged copy includes them. A shared bin folder still resolves to the single file. The npm layout is unchanged. Go vet and the runner tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
