# Trace: Site landing page and README overhaul

**Change slug:** `landing-and-readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-24

---

| ID | Claim | Basis link | Control / design feature | Evidence | Ship posture | Status |
|---|---|---|---|---|---|---|
| C-001 | `README.md` and `site/` accurately distinguish capabilities on `main` today from planned items, and pass public-claims and originality gates. | `basis.md` D1, D2, D4 | `tools/check_public_claims.py`, `tools/check_originality.py`, `scripts/test/site.test.mjs` | E-001, E-002 | Merge | pass |
| C-002 | Every empirical research figure in `README.md`, `site/`, and generated SVGs comes from scripted inputs with recorded SHA-256 digests (`AGENTS.md` rule 5). | `basis.md` D2, Fixed inputs | `docs/research/second-checker/build.py`, `docs/research/outside-perspectives-2026-11/evaluate.py` | E-003, E-004 | Merge | pass |
| C-003 | App screenshots in `docs/assets/readme/app/` are generated from the release build (`THEME_TEST_RELEASE=true`) via `apps/web/e2e/readme-shots.spec.ts` with mode-consistent fixtures. | `basis.md` What changes | Playwright Chromium run | E-005 | Merge | pass |
| C-004 | `site/` builds cleanly into a self-hosted static bundle with zero external network URLs, valid interactive controls, and preserved MIT attribution for Lobe Icons and OFL fonts. | `basis.md` D3, D5 | `scripts/build-site.mjs`, `scripts/test/site.test.mjs`, `tools/check_register.py` | E-002, E-006 | Merge | pass |
| C-005 | No CODEOWNERS trust surface or open PR #170/#174 `apps/web/src/*` file is modified, and repository CI checks pass. | `risk.md` Non-goals | `git diff --name-only`, `tools/check_owner_decisions.py`, `tools/license-gate.mjs`, `.ng` validate | E-007 | Merge | pass |
| N-001 | **Not claimed:** any compliance, certification, safety qualification, air-gap readiness of the full web app, or measured cross-vendor LLM defect-catch percentage prior to running `pnpm cr bench`. | `risk.md` | Explicit boundary statements in `README.md` and `site/` | none | n/a | n/a |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Every claim row C-001 through C-005 reaches `pass` with recorded evidence in `verification.md`.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
