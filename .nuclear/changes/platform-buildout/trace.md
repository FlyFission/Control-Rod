# Trace: controlled platform buildout

| Requirement | Implementation task | Required evidence |
|---|---|---|
| PB-01 controlled baseline | 1 | Pinned source tree, status inventory, no main mutation |
| PB-02 strict wire boundary | 2 | Raw malformed JSON and complete runner-schema refusal tests |
| PB-03 manual preparation | 3, 4, 5 | GP-01..05, GP-11, GP-14, GP-16, GP-18 tests |
| PB-04 signed prepared execution | 6, 7, 8, 9 | GP-06..10, GP-12..13 race/refusal tests, human signature |
| PB-05 confinement | 10 | Negative filesystem, secrets, network and lane evidence |
| PB-06 assisted preparation | 11 | GP-03, GP-15, GP-18 proposal/refusal tests |
| PB-07 pilot | 12 | GP-17, actual walkthroughs, restore/rollback rehearsal |
| PB-08 domain depth | 13 | Pinned tools, provenance, incomplete-input holds, output artifact checks |
| PB-09 platform expansion | 14 | ADR reconciliation and separate reviewed interface specs |

All rows begin planned. The execution ledger supplies current evidence and qualified completion; a mapping is not proof.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The task evidence and remaining authority gates are recorded honestly in the execution ledger.

## Source-lineage note

Workflow basis: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. Adapted as a local engineering record, not a compliance certification.
