# Risk: quality standards crosswalk

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-21 question about where the ISO 9001, NQA-1 and other QA inspiration is broken out.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow, ADR or spec version.
- Scope: `docs/qa-standards.md`, `README.md`, `docs/README.md`, `docs/boundary.md`, and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A reader takes the page as a compliance or certification claim. | The page opens with the boundary, links `boundary.md`, labels the paywalled standards as orientation only, and `tools/check_public_claims.py` passes on the README. | Any sentence stating Control Rod meets, implements or is certified to a standard. |
| R-02 | Paywalled standards text is copied or a template is shaped by it. | Paywalled standards appear by clause number only; every "what it asks" cell is a summary written for this page from the public Appendix B. | Any quoted or closely reworded NQA-1, ISO or IEC text. |
| R-03 | A feature is shown as built when it is only decided or planned. | Each status was checked against code on `main` or `docs/status.md`; decided-only items (ADR 0009 log, ADR 0016 flows, ADR 0023 trials) are marked Decided or Gap. | A Built row with no code behind it. |
| R-04 | A clause number is wrong for a reader's edition. | Editions are stated; the page asks readers to open an issue. | A reported mismatch left unfixed. |

## Selected mode

- **Mode:** Standard
- Basis: public documentation that outsiders may rely on when judging the product; no code behavior change; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/qa-standards.md` maps each 10 CFR 50 Appendix B criterion and the seven themes the owner asked about to the Control Rod feature at that spot, with a status checked against code on `main` and the gaps marked; paywalled standards appear by clause number only; no compliance or certification is claimed; the owner has read it.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
