# Basis: board redesign slice M4, quick add

**Change slug:** `board-m4`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-08
**Decision this basis supports:** whether the branch `claude/clever-pasteur-cqsq13` is merged as slice M4 of the board redesign.

## Mission / need

The design record [board-redesign](../board-redesign/basis.md) makes the board the home of the product. After slice M1 the board showed work but could not take it in: the empty state sent a person to the Packages page. Slice M4 (plan `docs/superpowers/plans/2026-11-06-board-redesign.md`, Task 8) adds an inline title field at the top of Ready, chained Enter, one card per pasted line, a capture card with the data-lane choice inline, and the handover from capture card to package cards when intake drafts them. The program gap analysis (`.nuclear/changes/program-gap-analysis/`) ranks this with M3 and M2 as the most frequent daily actions.

## Scope

In scope: `apps/web` only (see risk.md), the board axe spec, `docs/status.md`. Out of scope: M2, M3, M5 to M8; any API, spec, kernel, policy, red-team or workflow change. M4 depends on M1 only, which is merged.

## Fixed inputs

The owner decisions O1 to O8 and the parked list in the design record; controller rulings 1 to 18 of M1 (the capture card uses the same meaning symbols and words); workbench design M-0 (no content leaves the machine before classification).

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| A capture posted without a lane waits unclassified and no intake run starts. | `services/api/src/work.ts` requires lane authority to classify and refuses runs on unclassified content; `Captures.tsx` already relies on it. | A server change that defaults a lane for web captures. |
| `GET /captures` lists `package_ids` once intake drafts packages. | `spec/api.tsp` `CaptureView`; `Captures.tsx` links them. | A capture whose packages are not listed on the capture. |
| The event stream invalidates the `captures` query. | `lib/live.ts` flush list includes `captures`. | The key renamed or dropped from the flush list. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Previous slice: [board-m1](../board-m1/basis.md).

## Exit criteria

Slice M4 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the quick add field open and a capture card shown, and the owner has made the merge decision. Nothing here claims that intake drafted a package correctly, that the kernel enforces person verification (D-4 is unsigned), or that the board has been validated with real users.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
