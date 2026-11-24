# Basis: Control Room Visual Overhaul

**Change slug:** `control-room-overhaul`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Decision this basis supports:** whether the branch `ui/nuclear-control-room-overhaul` is merged, upgrading the Control Rod web application (`apps/web`) into a cohesive, lit nuclear plant control room console.

## Mission / need

Following the introduction of the dedicated Plant view (`plant-view`), the surrounding web application shell, design tokens, Sign-In screen, Today screen, and Plant console details still mix earlier general-purpose dashboard styling with the nuclear facility direction. This change overhauls the visual presentation of `apps/web` into a single cohesive, lit nuclear plant control room console while keeping all existing application behavior, API contracts, accessibility guarantees, and test suites intact.

## Scope

In scope:
- Design tokens and base console surfaces: `apps/web/src/styles/tokens.css`, `apps/web/src/styles.css` (upgraded Look A control-room theme as default; Look B and Look C preserved for existing contrast tests).
- Application shell and chrome: `apps/web/src/components/Shell.tsx` (polished topbar and navigation rail, compact 390px phone-width responsiveness, and live SCRAM-active chrome).
- Entry and shift pages: `apps/web/src/pages/SignIn.tsx` (atmospheric Sign-In airlock) and `apps/web/src/pages/Today.tsx` (crisp Shift Brief Today page).
- Centerpiece Plant view: `apps/web/src/features/office/OfficeView.tsx`, `apps/web/src/features/office/OfficeStage.tsx`, `apps/web/src/features/office/ReactorCore.tsx`, `apps/web/src/features/office/Annunciator.tsx`, `apps/web/src/features/office/Scram.tsx`, and `apps/web/src/features/office/office.css` (richer coolant-loop reactor core, backlit alarm annunciator matrix, segmented console switch banks, guarded SCRAM trip switch, and hazard-trimmed SCRAM/hold state).
- This change record under `.nuclear/changes/control-room-overhaul/`.

Out of scope (explicit non-goals and boundaries):
- No behavior changes, no route/state-machine changes, and no API or `spec/` changes.
- No edits to Board files: `apps/web/src/features/board/*`, `apps/web/src/pages/Board.tsx`, or `apps/web/src/lib/board.ts`.
- No trust-surface edits: `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions, or `kernel/`.
- No removal of Look B or Look C contrast tokens required by existing contrast tests.

## Fixed inputs

The existing API contracts in `spec/api.tsp` (unchanged); reading comfort and contrast rules (`docs/reading-comfort.md`, WCAG AA/AAA); keyboard navigation, `prefers-reduced-motion`, hidden-tab animation pause, and 390px phone-width support; the office theme contract in `apps/web/src/features/office/contract.ts`; and all existing Vitest and Playwright test suites in `apps/web`.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Look A is the default theme while Look B and Look C remain selectable and covered by existing contrast tests. | `apps/web/src/styles/tokens.css` and existing contrast specs. | Any contrast test failure on Look A, Look B, or Look C. |
| Visual console upgrades do not alter data fetching, auth flows, SCRAM invocation semantics, or Board rendering. | Scope boundary in this basis; existing unit and E2E suites. | Any diff in `spec/`, `apps/web/src/features/board/*`, `apps/web/src/pages/Board.tsx`, `apps/web/src/lib/board.ts`, or failing behavioral tests. |
| Instrument captions, SCRAM states, and annunciator states continue to reflect only confirmed API readings and never imply physical power or safety. | `plant-instruments.ts` pure state functions and `plant-view` basis. | Any label or visual state claiming a stop time, zero count, or physical plant quantity unsupported by API data. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Earlier work: [plant-view](../plant-view/basis.md).

## Exit criteria

The control room visual overhaul is implemented within the stated scope boundaries, all existing unit, typecheck, build, and browser/contrast tests pass with recorded outputs and digests in `verification.md`, after-screenshots are captured and reviewed, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, usability validation with real users, or that the visual console represents a real nuclear facility.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
