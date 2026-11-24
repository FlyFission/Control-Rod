# Plan: quality standards crosswalk

1. Search the repository for every mention of quality standards and their lineage; read the Nuclear-grade source map and do-not-cite list.
2. Report the findings to the owner.
3. Read the kernel, API, specs and status page for each control a QA program asks about, and record what is built, partial, decided or missing.
4. Write `docs/qa-standards.md`: the boundary, lineage versus orientation, a seven-theme quick view, the 18-criterion Appendix B table, software-specific controls, tool qualification, and ranked gaps.
5. Link it from `README.md`, `docs/README.md` and `docs/boundary.md`; run the public-claims check.
6. Owner reads the page and accepts or corrects it. Done when recorded in `ship.md`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/qa-standards.md` maps each 10 CFR 50 Appendix B criterion and the seven themes the owner asked about to the Control Rod feature at that spot, with a status checked against code on `main` and the gaps marked; paywalled standards appear by clause number only; no compliance or certification is claimed; the owner has read it.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
