# Basis: the Plant view

**Change slug:** `plant-view`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** whether the branch `claude/project-thread-pi83dg` is merged, making the Plant the default office view and archiving the office themes under Advanced.

## Mission / need

On 2026-11-23 the owner asked to move away from the office themes toward one dedicated nuclear facility view (control room, reactor, confinement layers, zoning), saying one excellent on-brand theme beats fifteen to twenty mediocre ones, and that the tab must be much more beautiful. The owner asked for a plan reviewed adversarially by independent reviewers and then built.

## Scope

In scope: `apps/web/src/features/office/`, the plant art generator and its outputs, the `/plant` route and its `/office` redirect, the office harness spec, `README.md` (The office section), `docs/status.md`, `docs/office-view/plant.md`, the design document and this packet. Out of scope: any API, spec, kernel, policy, red-team or workflow change; `components/Shell.tsx`, `styles.css` and `docs/README.md` (open pull requests #137 and #150 change them).

## Fixed inputs

The 13 `FigurePlace` values and the `AgentFigure`, floor and SCRAM shapes in `spec/api.tsp` (unchanged); office view acceptance cases OV-01 to OV-08 (`docs/office-view/acceptance.md`); the theme contract and allowlisted SVG validator in `contract.ts`; reading comfort rules (`docs/reading-comfort.md`).

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| `needs_me` is the control plane's count of items waiting on the viewer. | `spec/api.tsp` office floor response; the Inbox uses it. | A Waiting on you count that differs from the Inbox. |
| A SCRAM is in force until restarted, and its `stopped` timing appears only once runs have stopped. | `GET /scrams` summary in `spec/api.tsp`; the SCRAM banner relies on it. | Rods drawn inserted, or a stop time claimed, before the control plane records it. |
| The scrams read is not served while presenting. | Existing SCRAM banner behavior. | A SCRAM detail shown on a shared screen. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design: [plant view design](../../../docs/superpowers/specs/2026-11-23-plant-view-design.md). Earlier work: [overlay-themes](../overlay-themes/basis.md).

## Exit criteria

The Plant view is implemented with its tests and evidence retained in this packet, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, validation with real users, or that the art resembles any real facility; it is a stylized plan, not an engineering drawing.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
