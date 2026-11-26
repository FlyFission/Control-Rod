# Trace: Open the pull request when an accepted card wrote more than one patch

| Need | Code | Test |
| --- | --- | --- |
| One rule picks the change | `services/api/src/work.ts` changePatches | `test/patch-files.test.ts` changePatches |
| Publisher uses it, joining disjoint patches | work.ts publishAccepted | `test/publish-checkout.test.ts`, `test/runs.test.ts` |
| Checker is told the same change | work.ts wholeChangeSection | `test/runs.test.ts` "tells the checker that a checkout card's one patch is the whole change" |
| Author asked for one changes.patch | `daemon/internal/runner/checkout.go` checkoutPrompt | runner checkout tests |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pull request opens from one well-defined change: a single patch; the top-level patch over copies in folders; changes.patch among several; or top-level patches that touch disjoint files, together. Patches that change the same file are still refused, in words that name them. The checker's whole-change section uses the same choice. The checkout author prompt asks for one changes.patch. Tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
