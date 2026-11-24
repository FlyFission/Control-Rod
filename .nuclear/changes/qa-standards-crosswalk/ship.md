# Ship: quality standards crosswalk

Release decision: **proposed merge as documentation; the owner retains the decision.**

- **Proposed:** merge `docs/qa-standards.md` and the three links to it.
- **Not claimed:** compliance, certification, qualification or assessment against any standard; that the paywalled clause numbers were checked against purchased copies; that any listed gap is fixed.
- **Owner decisions this page raises, not taken here:** whether QA overlays should become Cedar floors in `policies/` (a trust surface), and whether rigor tiers should change gates.

Rollback: revert the commit. Documentation only; no code, schema or wire change.

Monitoring after merge: when a listed gap closes or a feature changes status, update the row in the same change.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/qa-standards.md` maps each 10 CFR 50 Appendix B criterion and the seven themes the owner asked about to the Control Rod feature at that spot, with a status checked against code on `main` and the gaps marked; paywalled standards appear by clause number only; no compliance or certification is claimed; the owner has read it.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
