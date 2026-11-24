# Plan

1. Check the findings against the audited baseline and work in a clean branch.
2. Protect tenant entry points, preserve supervision and evidence semantics, and repair Git and parser boundary cases.
3. Apply schema changes through a forward migration and regenerate the WebAssembly kernel with the pinned tooling.
4. Verify the API, daemon, kernel and change record, then present the patch for owner review.

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Implement and test the confirmed fixes, disclose platform and upgrade limits, and obtain the required owner decision before merge.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
