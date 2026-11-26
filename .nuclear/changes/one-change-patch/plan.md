# Plan: Open the pull request when an accepted card wrote more than one patch

1. `changePatches` in work.ts picks the change from the patch outputs; the publisher and the checker's whole-change section both use it.
2. Disjoint patches are joined in name order, each ending in a newline.
3. The checkout author prompt asks for every change in one changes.patch and no other patch file.
4. Unit tests; the publish and runs suites. PR, merge on green. After the next update, the server's start pass retries both cards (the refusal reason "failed" is not final).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pull request opens from one well-defined change: a single patch; the top-level patch over copies in folders; changes.patch among several; or top-level patches that touch disjoint files, together. Patches that change the same file are still refused, in words that name them. The checker's whole-change section uses the same choice. The checkout author prompt asks for one changes.patch. Tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
