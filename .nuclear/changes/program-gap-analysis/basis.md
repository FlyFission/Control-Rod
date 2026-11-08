# Basis: program gap analysis

**Change slug:** `program-gap-analysis`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-08
**Decision this basis supports:** whether `docs/superpowers/specs/2026-11-08-program-gap-analysis.md` and its companion `2026-11-08-adoption-and-retention-analysis.md` are accepted as the ranked list of end-user and program gaps that orders work after the board redesign slices, and whether its four requested owner decisions are taken.

## Mission / need

The owner asked (2026-11-08) what gaps the repository and the program have for the end user and their quality of life, measured against the board-based agent tools in use today (Multica and Munder Difflin were named), with a SWOT and a gap analysis, and for the application to be made best in class. The board redesign record ordered eight slices from the pilot of 2026-11-05; this record looks wider: the whole product, the install and platform story, and the program that builds it.

## Scope

In scope: the analysis document; the regenerated command inventory (a known rough edge in `status.md`); the status page and documentation index updates that point at the analysis. Out of scope: any change to the web app, kernel, daemon, sandbox, attestation, records, policies, workflows or `spec/`. Slice M4 of the board redesign was built in the same branch under its own record, `board-m4`.

## Fixed inputs

The owner decisions O1 to O8 and the parked list of the board redesign record; ADR 0020 (one-shot runs) and ADR 0021 (native sandboxes); AGENTS.md rules 1 to 6.

## Sources

1. The repository on `main` at `2d1886d`, read in code.
2. `.nuclear/changes/board-redesign/evidence/` research files 01 to 07 and the review synthesis (2026-11-05 and 2026-11-06).
3. Public READMEs of Multica (`github.com/multica-ai/multica`) and Munder Difflin (`github.com/HarnessMD/munder-difflin`) and two third-party roundups, read 2026-11-08.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The README of each named competitor describes what it ships. | Vendor documentation, dated. | Testing the product shows a listed capability missing or an unlisted one present. |
| The field's most reacted feature requests (research 03 section 5) predict what Control Rod's users will ask for. | Five or more repositories per item. | The owner validation (P-01) stalls on something the ranking did not predict. |
| The slice rule (one slice, one pull request) still holds for the work this document orders. | Board redesign plan global constraints. | The owner changes the rule. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The analysis documents are complete, the sources it rests on are cited with their dates, the owner has read it and answered or deferred its four requested decisions. No product code is part of this change beyond the command inventory regeneration and the status page; no claim is made about any competitor beyond what its public README or the cited research said on the date given.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
