# Risk: Open the pull request when an accepted card wrote more than one patch

- A wrong choice could push a change that was not what the checker saw. The checker sees every deliverable, including all patches. The rule only joins patches that touch disjoint files, so no change is applied twice, and `git apply --cached` still refuses a patch that does not apply. Overlapping patches are refused as before.
- A copy under a folder is ignored only when a top-level patch exists.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pull request opens from one well-defined change: a single patch; the top-level patch over copies in folders; changes.patch among several; or top-level patches that touch disjoint files, together. Patches that change the same file are still refused, in words that name them. The checker's whole-change section uses the same choice. The checkout author prompt asks for one changes.patch. Tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
