# Ship: Open the pull request when an accepted card wrote more than one patch

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread on 2026-11-25 at 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. No trust surface is touched.

- Rollback: revert the merge.
- Monitoring after merge: after the next `controlrod update`, both cards open their pull requests on the server's start pass.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pull request opens from one well-defined change: a single patch; the top-level patch over copies in folders; changes.patch among several; or top-level patches that touch disjoint files, together. Patches that change the same file are still refused, in words that name them. The checker's whole-change section uses the same choice. The checkout author prompt asks for one changes.patch. Tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
