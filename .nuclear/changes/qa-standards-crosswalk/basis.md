# Basis: quality standards crosswalk

**Change slug:** `qa-standards-crosswalk`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether `docs/qa-standards.md` is accepted as the public page that shows how Control Rod's controls relate to the quality standards its users work under.

## Mission / need

The owner asked (2026-11-21): "Where is the ISO 9001, NQA-1 and any other QA inspiration? I dont see that broken out anywhere". The search found the lineage scattered: ADR 0015 names NQA-1, ISO 9001 and 21 CFR Part 11 as example overlays; `docs/boundary.md` and the README say what Control Rod is not; each Nuclear pack skill carries a source-lineage note pointing to the Nuclear-grade source map in another repository. Nothing in this repository lays the standards side by side with the features.

## Scope

In scope: `docs/qa-standards.md`; one link each in `README.md`, `docs/README.md` and `docs/boundary.md`; this record. Out of scope: any code, policy, workflow, `spec/`, kernel or ADR change. The gaps the page lists are not fixed here.

## Fixed inputs

AGENTS.md rules 1 to 6; `docs/boundary.md`; `docs/sqa/README.md` (requirements cite clause numbers only); the Nuclear-grade `source-map.md` and `do-not-cite-directly.md` at that repository's `main`, read 2026-11-21.

## Sources

1. The repository on `main` at `47f86af`, read in code: `kernel/src/transition.rs`, `services/api/src/`, `spec/tenancy.tsp`, `spec/records.tsp`, `docs/status.md`, the ADRs cited on the page.
2. The public regulations and DOE documents linked on the page (10 CFR 50 Appendix B, 10 CFR 830, 10 CFR Part 21, 21 CFR Part 11, DOE-HDBK-1028-2009, DOE-STD-1073-2016, NIST SP 800-218, SLSA).
3. Clause numbers of ASME NQA-1, ISO 9001:2015 and ISO 19443:2018 from the author's general knowledge, with no standards text used.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| NQA-1 Part I Requirements 1 to 18 follow Appendix B Criteria I to XVIII one for one. | Widely published structure of both documents. | A reader with the edition in use reports a mismatch. |
| ISO 9001:2015 clause numbers in the page are current. | 2015 edition structure. | A new edition of ISO 9001 is published, or a reader reports a wrong clause. |
| Status words match `main`. | Code read on 2026-11-21. | A later change builds or removes a listed feature. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/qa-standards.md` maps each 10 CFR 50 Appendix B criterion and the seven themes the owner asked about to the Control Rod feature at that spot, with a status checked against code on `main` and the gaps marked; paywalled standards appear by clause number only; no compliance or certification is claimed; the owner has read it.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
