# Trace: quality standards crosswalk

| ID | Requirement | Evidence | Disposition |
|---|---|---|---|
| A-1 | The page shows where QA lineage already lives in both repositories. | `docs/qa-standards.md` "Where the ideas came from"; E-01 | done |
| A-2 | Document control, design control, verification, independent review, records, corrective action and approvals each map to Control Rod features, with status and gaps. | Quick view table; E-02 | done |
| A-3 | All 18 Appendix B criteria are mapped, with NQA-1 and ISO 9001 clause numbers and other references where they apply. | Full crosswalk table; E-02 | done |
| A-4 | No compliance or certification claim, and no paywalled standards text. | Page opening and orientation section; E-03 | done |
| A-5 | The owner has read the page and accepted or corrected it. | E-04 | open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/qa-standards.md` maps each 10 CFR 50 Appendix B criterion and the seven themes the owner asked about to the Control Rod feature at that spot, with a status checked against code on `main` and the gaps marked; paywalled standards appear by clause number only; no compliance or certification is claimed; the owner has read it.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
