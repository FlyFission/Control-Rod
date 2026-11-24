# Trace

| Findings | Implementation |
|---|---|
| H1–H4 | Organization ownership in HTTP handlers, inbox, run and capture queries, and event visibility |
| H5, M5, M16 | Final event indexes, bounded completion suffix, and ordered rate-limit notices |
| H6, M2, M4 | Checker invocation provenance, nested policy validation, and unowned process handling |
| H7, M8, M9 | Preparation history configuration, verified result basis, and source pins |
| M1, M11, L1 | Local Git config validation and checkpoint staging and refs |
| M3, L7 | Runtime identity and canonical digest validation in the kernel and rebuilt WebAssembly |
| M6, M7, L2, L3 | Run supervision, stop holds, and duplicate identifier validation |
| M10 | Additive dependency provenance migration |
| M12–M14, L4 | Section anchors and unified diff boundaries |
| M15, L5, L6 | Budget and evidence validation |
| M17–M19 | CONNECT half-close, keychain error classification, and capture root validation |

## Required links

[Basis](basis.md), [plan](plan.md), [risk](risk.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Implement and test the confirmed fixes, disclose platform and upgrade limits, and obtain the required owner decision before merge.

## Source-lineage note

Local engineering evidence under the repository workflow. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md)
