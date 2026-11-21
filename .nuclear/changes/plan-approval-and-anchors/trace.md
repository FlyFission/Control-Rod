# Trace: anchored notes and plan approval

| Requirement | Where | Check | Disposition |
|---|---|---|---|
| A-1 Head lines anchor only when the quote is at those lines; on a diff target they say whether they touch the change. | `checkAnchor` | head lines tests (E-02) | done |
| A-2 Base lines anchor only removed or changed lines on a diff target. | same | base lines tests (E-02) | done |
| A-3 A deleted file anchors only when the diff deletes it and it is absent from head. | same | deleted file tests (E-02) | done |
| A-4 A section resolves to exactly one heading path, outside code fences; a base section only when the change removed it. | `sections`, `checkAnchor` | section tests (E-02) | done |
| A-5 Paths cannot leave the snapshot. | `AnchorPath`, `validPath` | path tests and contract test (E-02) | done |
| A-6 The contract regenerates with no drift and validates under the strict loader. | `spec/anchors.tsp` | E-02 | done |
| P-1 Whether Plannotator's plan hook works in print-mode runs. | spike | E-01: `ExitPlanMode` absent under `-p` | done: it does not |
| P-2 Whether `PermissionRequest` can approve or refuse in print mode. | spike | E-01: deny refused the write; allow let it run | done |
| P-3 A design for plan approval in runs. | `docs/superpowers/specs/2026-11-18-plan-approval-design.md` | owner review | open: owner review |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The anchor contract regenerates with no drift, the anchor check passes its tests and fails each planted fault, the print-mode hook spike is recorded, the plan approval design is written, and the owner has reviewed all three.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
