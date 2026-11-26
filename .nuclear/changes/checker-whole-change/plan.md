# Plan: The checker is told a checkout card's patch is the whole change

1. `patchFiles(patch)` reads the files a unified diff touches.
2. `wholeChangeSection` adds the section to the pre-check brief when the capture has a checkout and the author delivered exactly one .patch or .diff (the same rule `publishAccepted` uses).
3. Tests: test/patch-files.test.ts; a runs.test.ts case that reads the checker's BRIEF.md.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

For a card on a repository checkout whose author delivered exactly one patch, the pre-check brief has a "The whole change" section: the pull request is built from the bound commit plus that patch only, and it lists the files the patch touches. API tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
