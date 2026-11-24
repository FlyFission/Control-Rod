# Plan: anchored notes and plan approval

1. Write the anchor contract in `spec/anchors.tsp` and regenerate.
2. Write the deterministic check and its tests; break it on purpose to show the tests catch each fault.
3. Run the print-mode hook spike: `ExitPlanMode` under plan mode, then a `PermissionRequest` deny and allow on `Write`.
4. Write the plan approval design from what the spike found.
5. Update the pattern note and the docs index.
6. Later, each in its own change: review panel R3 uses the check; plan approval slices P1 to P4 per the design.

Steps 1 to 5 are in this change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The anchor contract regenerates with no drift, the anchor check passes its tests and fails each planted fault, the print-mode hook spike is recorded, the plan approval design is written, and the owner has reviewed all three.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
