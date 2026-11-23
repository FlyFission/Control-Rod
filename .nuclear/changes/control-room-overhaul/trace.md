# Trace: Control Room Visual Overhaul

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | Look A control-room design tokens and surfaces (`apps/web/src/design/tokens.css`, `apps/web/src/styles.css`) deliver a cohesive lit console aesthetic while preserving WCAG AA/AAA contrast and leaving Look B and Look C intact. | `contrast.test.ts` (10/10); `looks-contrast.test.ts` (188/188); `type-scale.test.ts` (5/5); `node apps/web/scripts/check-contrast.mjs` (0/159 failures) (E-01, E-03) | implemented and tested |
| T-02 | Shell, topbar, and navigation rail (`apps/web/src/components/Shell.tsx`) present polished control-room chrome, compact 390px phone-width responsiveness, keyboard accessibility, and live SCRAM-active chrome without behavior change. | `shell.test.tsx` (3/3); `before/after-plant-phone.png` and `before/after-plant-scram-1440.png` (E-01, E-05) | implemented and tested |
| T-03 | Sign-In (`apps/web/src/pages/SignIn.tsx`) presents an atmospheric airlock and Today (`apps/web/src/pages/Today.tsx`) presents a crisp Shift Brief layout with unchanged authentication and data flows. | `signin.test.tsx`; `wave3-pages.test.tsx`; `before/after-signin-1440.png` and `before/after-today-1440.png` (E-01, E-05) | implemented and tested |
| T-04 | Plant view (`apps/web/src/features/office/OfficeView.tsx`, `ReactorCore.tsx`, `Scram.tsx`, `office.css`) features a richer coolant-loop reactor core, backlit alarm annunciator matrix, segmented console switch banks, guarded SCRAM trip switch, and hazard-trimmed SCRAM/hold state while preserving state truthfulness, reduced-motion, and hidden-tab rules. | `plant-instruments.test.ts` (13/13); `plant-layout.test.ts` (6/6); `annunciator.test.tsx` (5/5); `scram.test.tsx`; `stage.test.tsx` (3/3); `contract.test.ts` (41/41) (E-01, E-02, E-05) | implemented and tested |
| T-05 | Strict scope boundaries hold: only 9 in-scope `apps/web` files modified (`design/tokens.css`, `styles.css`, `components/Shell.tsx`, `pages/SignIn.tsx`, `pages/Today.tsx`, `features/office/ReactorCore.tsx`, `OfficeView.tsx`, `Scram.tsx`, `office.css`); zero edits to `spec/`, `apps/web/src/features/board/*`, `apps/web/src/pages/Board.tsx`, `apps/web/src/lib/board.ts`, or trust surfaces (`policies/`, `tests/redteam/`, `.github/workflows/`, `kernel/`). | `git diff --name-only`; `pnpm --filter @control-rod/web build`; `check_theme_assets.py`; `check_offline_assets.py` (E-02, E-04) | implemented and verified |
| T-06 | Visual quality and legibility are evidenced across 1440×900 desktop, 390×844 phone, and SCRAM-active states via before/after screenshots with recorded SHA-256 digests. | Before/after screenshots in `evidence/screenshots/` and `evidence/digests.sha256` (E-05) | captured; owner review open |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Earlier work: [plant-view](../plant-view/basis.md).

## Exit criteria

The control room visual overhaul is implemented within the stated scope boundaries, all existing unit, typecheck, build, and contrast checks pass with recorded outputs and digests in `verification.md`, after-screenshots are captured and reviewed, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, usability validation with real users, live full-stack E2E coverage, or that the visual console represents a real nuclear facility.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
