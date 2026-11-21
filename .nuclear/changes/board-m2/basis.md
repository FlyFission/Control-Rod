# Basis: board redesign slice M2, lenses

**Change slug:** `board-m2`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether the branch `feat/board-m2-lenses` is merged as slice M2 of the board redesign.

## Mission / need

The design record [board-redesign](../board-redesign/basis.md) makes the board the home of Control Rod and establishes lenses (design spec section 6.2) so one board answers different questions without duplicating screens: filtering by kind (with counts), Needs you, and Mine; coloring the card edge by kind, state, agent, person, or none; grouping into swimlanes by kind, person, or project; toggling comfortable vs compact density; syncing lens state in the URL; saving per-member views in browser storage; and enforcing the default-view guard so no filter silently hides work waiting on a person verification or a signature. Slice M2 implements Tasks 5 and 6 of `docs/superpowers/plans/2026-11-06-board-redesign.md`.

## Scope

In scope: `apps/web/src/lib/lenses.ts`, `apps/web/src/lib/lenses.test.ts`, `apps/web/src/features/board/` (`LensBar.tsx`, `LensBar.test.tsx`, `savedViews.ts`, `BoardView.tsx`, `Card.tsx`, `useBoardData.ts`, `board.css`, `board.test.tsx`), `apps/web/e2e/board-looks.spec.ts`, `docs/status.md`, and this packet. Out of scope: M5 to M8; any API, spec, kernel, policy, red-team, or workflow change. M2 depends on M1, which is merged.

## Fixed inputs

Owner decisions O1 to O8 and the anti-goals in the design record (in particular A-3: color is never the only carrier of meaning, and A-4: the default view never hides work waiting on a person verification or signature); controller rulings 1 to 18 of M1; the contrast rules in `apps/web/src/design/contrast.test.ts` and type-scale rules in `apps/web/src/design/type-scale.test.ts`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Browser `localStorage` is per-device convenience storage in the MVP (`cr.views.<user>`); server persistence is deferred. | Design spec section 6.2 ("kept per member (browser storage in the MVP; server persistence later)"). | A requirement for cross-device view syncing before M8. |
| Card ownership for Mine and Group by person comes from `PackageView.originators[0]`. | M1 as built (`useBoardData.ts`, ruling 8). | A change in how card ownership is represented on `WorkPackage` or `PackageView`. |
| Protected cards are those in `person-verifies` or `needs-signature` columns. | Plan Task 5 (`isProtected` definition). | Addition of a new verification or signature column. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m3](../board-m3/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M2 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims cross-device persistence of saved views, Firefox or WebKit behavior beyond Chromium, or validation with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
