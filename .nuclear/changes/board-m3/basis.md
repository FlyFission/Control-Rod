# Basis: board redesign slice M3, act from the card

**Change slug:** `board-m3`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether the branch `claude/project-thread-hqvd67` is merged as slice M3 of the board redesign.

## Mission / need

The design record [board-redesign](../board-redesign/basis.md) makes the board the home of the product. After M1 and M4 a person can see work and add it, but every decision (Release, Accept, Return, Reject) still needs a trip to the package page. Slice M3 (plan `docs/superpowers/plans/2026-11-06-board-redesign.md`, Task 7) puts the one primary decision on the card face and every other decision, plus Stop while a run is active, in a Move to menu. The owner's 2026-11-21 instruction asks for the board to become usable day to day and for work to go through to pull requests; acting from the card is the most frequent daily action the program gap analysis names.

## Scope

In scope: `apps/web/src/features/board/` only, `docs/status.md`, and this packet. Out of scope: M2, M5 to M8; any API, spec, kernel, policy, red-team or workflow change. M3 depends on M1, which is merged.

## Fixed inputs

Owner decisions O1 to O8 and the parked list in the design record; controller rulings 1 to 18 of M1, in particular ruling 16 (no Accept on Safety or Material work without a covering person verification, applied by `blockUnverifiedAccept`); the existing signed-decision flow in `lib/decide.ts` (options, passkey, decide over the shown digest).

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The actions list for a package names every decision the viewer could take, with `allowed`, `reason` and `change`. | `spec/api.tsp` `ActionDescriptor`; the package page already renders from it. | A decision the server accepts that the actions list does not name. |
| The server refuses a decision over a stale digest or revision. | `services/api` decision route compares `shown_digest` and `package_revision`; the package page relies on it. | A decision recorded over a digest the person did not see. |
| `POST /packages/:id/runs/:run/stop` requests a stop and the run's outcome is recorded later. | `api/client.ts` `stopRun`; the package page's Stop. | A stop that is reported as done before the run ends. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slices: [board-m1](../board-m1/basis.md), [board-m4](../board-m4/basis.md).

## Exit criteria

Slice M3 is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims that the kernel enforces person verification (D-4 is unsigned; the Accept block on Safety and Material work is a screen rule), behavior in Firefox or WebKit, or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
