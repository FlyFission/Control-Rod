# Basis: Open the pull request when an accepted card wrote more than one patch

Cards B44DFF3A (#204) and 723F7A44 (#206) were accepted on the owner's Mac with no clicks, but no pull request opened: "The accepted work has 2 patch files, so Control Rod cannot tell which one to open a pull request for." B44DFF3A wrote fix.patch plus a copy at work/changes.patch. 723F7A44 wrote FIX.diff and TESTS.diff, which touch different files. The author prompt only asked for "a patch of your changes", so agents reasonably wrote several.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pull request opens from one well-defined change: a single patch; the top-level patch over copies in folders; changes.patch among several; or top-level patches that touch disjoint files, together. Patches that change the same file are still refused, in words that name them. The checker's whole-change section uses the same choice. The checkout author prompt asks for one changes.patch. Tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
