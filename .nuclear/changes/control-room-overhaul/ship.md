# Ship: Control Room Visual Overhaul

Release decision: **merge on the owner's yes after PR visual review.** All local automated checks (build, 776 unit tests, 159-pair contrast audit, theme/offline asset checks) pass and before/after screenshots with SHA-256 digests are retained in this packet.

- **Proposed:** merge branch `ui/nuclear-control-room-overhaul` once the owner approves the PR before/after screenshots.
- **Recorded verification summary:**
  - Scope (E-04): 9 modified `apps/web` files (`design/tokens.css`, `styles.css`, `components/Shell.tsx`, `pages/SignIn.tsx`, `pages/Today.tsx`, `features/office/ReactorCore.tsx`, `OfficeView.tsx`, `Scram.tsx`, `office.css`); zero changes to `features/board/`, `pages/Board.tsx`, `lib/board.ts`, `spec/`, or trust surfaces.
  - Web unit suite (E-01): `pnpm --filter @control-rod/web test` passed — 59/59 test files, 776/776 tests passed.
  - Web build pipeline (E-02): `pnpm --filter @control-rod/web build` (`check:themes`, `check:office` 41/41, `gen:api`, `tsc --noEmit`, `vite build`) exited 0.
  - Contrast audit (E-03): `node apps/web/scripts/check-contrast.mjs` passed — Failures: 0 of 159 (`evidence/tokens-contrast-looks.txt`).
  - Asset checks (E-04): `python3 tools/check_theme_assets.py --root .` passed (15 complete passive-art packs); `python3 tools/check_offline_assets.py` passed (`offline assets check passed`).
  - Visual screenshots (E-05): 5 before/after pairs captured at 1440×900 and 390×844 under `evidence/screenshots/` with SHA-256 digests in `evidence/digests.sha256`.
- **Not claimed:** owner visual sign-off on the PR screenshots (open for review on the PR); live full-stack E2E verification (open for review on the PR); Firefox or WebKit behavior (Chromium only); usability testing with real users; that the stylized control-room console represents any real nuclear facility; any API, kernel, policy, or Board behavior change.
- **Owner decisions requested:** review the before/after screenshots on the PR (Plant 1440×900, Plant SCRAM 1440×900, Plant 390×844 phone, Today 1440×900, Sign-In 1440×900) and approve or return the merge.

Rollback: revert the merge commit. No API, schema, wire format, Board file, or persisted user data is modified.

Monitoring after merge: confirm that SCRAM-active chrome always matches live `/scrams` state, that Look A/B/C contrast remains intact, and that narrow-screen (390px) navigation and Plant list fallback remain unobstructed.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Earlier work: [plant-view](../plant-view/basis.md).

## Exit criteria

The control room visual overhaul is implemented within the stated scope boundaries, all existing unit, typecheck, build, and contrast checks pass with recorded outputs and digests in `verification.md`, after-screenshots are captured and reviewed, and the owner has made the merge decision. Nothing here claims behavior in Firefox or WebKit, usability validation with real users, live full-stack E2E coverage, or that the visual console represents a real nuclear facility.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
