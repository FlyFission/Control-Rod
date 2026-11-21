# Trace: audit export for a time window

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| A-1 | The export holds every event recorded in the window, derived from recorded times, inside the chain from entry 1 and under the seal covering the window's last event. | E-01 | done |
| A-2 | The export checks offline with `pnpm cr verify`, and a moved event time fails it. | E-01, E-02 | done |
| A-3 | Bad windows are refused with 400 and an empty window with 404. | E-01 | done |
| A-4 | Package proofs behave as before. | E-03 | done |
| A-5 | The Records page exports a window, sends it with its zone and offers the file and the offline command. | E-02 | done |
| A-6 | The owner's recorded yes covers the `spec/` change. | `ship.md` Signature | open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`GET /records/export?from&to` returns every event recorded in a half-open time window inside the chain from its first event, under the first valid seal covering the window's last event, checkable offline by `pnpm cr verify` through `verifyWindow`; the Records page exports and downloads it; package proofs behave as before; tests cover it; CI is green; the owner's recorded yes covers the `spec/` change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
