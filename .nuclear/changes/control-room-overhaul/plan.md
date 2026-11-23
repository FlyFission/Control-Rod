# Plan: Control Room Visual Overhaul

1. **Design tokens and base surfaces (`apps/web/src/styles/tokens.css`, `apps/web/src/styles.css`):** Upgrade Look A (default) into a cohesive, lit nuclear plant control room palette with recessed panel surfaces, crisp instrument bezels, legible typographic hierarchy, and WCAG AA/AAA contrast ratios. Preserve Look B and Look C token definitions so existing contrast tests continue to pass untouched.
2. **Application shell and SCRAM-active chrome (`apps/web/src/components/Shell.tsx`, `apps/web/src/styles.css`):** Polish the topbar and navigation rail with console-grade indicators, compact 390px phone-width layout responsiveness, clear keyboard focus rings, and live SCRAM-active chrome framing when a SCRAM is in force.
3. **Sign-In airlock and Shift Brief Today page (`apps/web/src/pages/SignIn.tsx`, `apps/web/src/pages/Today.tsx`):** Style Sign-In as an atmospheric control-room airlock and tighten Today into a crisp Shift Brief console layout, keeping all authentication, routing, and data-loading behavior unchanged.
4. **Centerpiece Plant view (`apps/web/src/features/office/OfficeView.tsx`, `OfficeStage.tsx`, `ReactorCore.tsx`, `Annunciator.tsx`, `Scram.tsx`, `office.css`):** Elevate the Plant console with a richer coolant-loop reactor core, backlit alarm annunciator matrix, segmented console switch banks, guarded SCRAM trip switch, and hazard-trimmed SCRAM/hold state. Preserve pure instrument state semantics, non-color state cues, reduced-motion / hidden-tab pauses, and narrow-screen list fallback.
5. **Scope-boundary check and verification:** Confirm zero edits to `spec/`, Board files (`apps/web/src/features/board/*`, `apps/web/src/pages/Board.tsx`, `apps/web/src/lib/board.ts`), or trust surfaces (`policies/`, `tests/redteam/`, `.github/workflows/`, `kernel/`). Run typecheck, unit tests, production build, Chromium Playwright harnesses (contrast, office harness, responsive/reduced-motion), and repository checks; capture after-screenshots and record all outputs and digests in `verification.md` and `ship.md`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Earlier work: [plant-view](../plant-view/basis.md).

## Exit criteria

The control room visual overhaul is implemented within the stated scope boundaries, all existing unit, typecheck, build, and browser/contrast tests pass with recorded outputs and digests in `verification.md`, after-screenshots are captured and reviewed, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, usability validation with real users, or that the visual console represents a real nuclear facility.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
