# Basis: board redesign slice M1, the board as home

**Change slug:** `board-m1`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-06
**Decision this basis supports:** whether PR #65 (branch `board-m1`) is merged as slice M1 of the board redesign.

## Mission / need

The design record [board-redesign](../board-redesign/basis.md) sets the target: the board is the home of the product. Slice M1 (plan `docs/superpowers/plans/2026-11-06-board-redesign.md`, Tasks 1 to 4) makes `/` the board with six columns including Person verifies, a card face with kind, grade and a next line derived from the actions endpoint, fixed meaning colors and symbols, and three looks.

## Scope

In scope: `apps/web` (board, card, next line, event stream status, looks, the shared acceptance rule in the decision bar, case view, palette and office card), two additive read additions in `spec/api.tsp` (`PersonVerificationEntry` with `package_revision` and `covers_current_subject`; `PackageView.originators`), the matching API handlers in `services/api`, and this packet. Out of scope: kernel decision functions, policies, red-team fixtures, workflows, any spec major version, and M2 to M8.

## Fixed inputs

The owner decisions O1 to O8 in the design record, and the binding controller rulings 1 to 18 in [m1-rulings](m1-rulings.md). The interfaces as built are in the "M1 as built" section of the plan.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The web can apply the acceptance rule (ruling 16) without a kernel change. | The rule only hides or refuses Accept on screen; the server still allows it. | The owner signs D-4, which moves the rule into the kernel; the screen rule then follows the server. |
| The server can recompute what a verification signed (ruling 18). | The record keeps criteria, outcome and the signed digest; the subject and author run are read from current state. | A change to how the verification digest is built that the recomputation does not follow. |
| Licence currency is not visible to the web, so the O6 line can under-report a lapsed licence. | Ruling 12. | Task 7 reads verifier eligibility from the server. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Rulings: [m1-rulings](m1-rulings.md).

## Exit criteria

Slice M1 is implemented in PR #65 with its tests and evidence retained in this packet, the review findings and controller rulings 1 to 18 are addressed, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned) or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
