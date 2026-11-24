# Risk: Site landing page and README overhaul

**Purpose:** Name what this overhaul could get wrong and the evidence needed before it merges.

**Change slug:** `landing-and-readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Lifecycle phase:** Verify
**Status:** Ready for owner visual review.

---

## Mission anchor

- **Objective:** Overhaul `README.md`, build a self-hosted interactive marketing and demo landing page in `site/`, refresh app screenshots and deterministic SVG diagrams, and add viral adoption entry points (`docs/quickstart-check.md`, 200-perspective due diligence in `docs/research/outside-perspectives-2026-11/`, and a ready-to-enable Pages workflow in `deploy/github-pages.yml`) aligned with ADR 0024 and current `main`.
- **Success criterion (done when):** Every capability stated as present today exists on `main`; planned items are explicitly marked planned or coming soon; no empirical or engineering number is typed by hand (`AGENTS.md` rule 5); `site/` makes zero third-party network requests; `tools/check_public_claims.py`, `tools/check_originality.py`, `tools/check_offline_assets.py`, `tools/check_owner_decisions.py`, `tools/check_register.py`, `tools/license-gate.mjs` and `.ng` strict-custody validation pass; screenshots come from the real release build via `apps/web/e2e/readme-shots.spec.ts`.
- **Non-goals:** Editing any CODEOWNERS trust surface (`policies/`, `tests/redteam/`, `.github/`, `spec/`, `kernel/`, `docs/adr/`), colliding with open PR #174 (`apps/web/src/*`) or PR #170, or making compliance, certification or safety claims.

## Risk class

Low. Static marketing site (`site/`), build/preview scripts, `README.md`, documentation, research study scripts, and Playwright screenshot fixtures. No kernel, contract, API, daemon, policy, or `.github/` workflow behavior changes.

## Selected mode

- **Mode:** Standard
- Basis: multi-file public-facing overhaul whose claims, empirical numbers, offline assets, and screenshot provenance each need explicit traceability.

## Questioning-attitude summary

| Question | Answer |
|---|---|
| Could catchy copy overstate isolation, compliance, or runnable adapters? | Controlled by extending `tools/check_public_claims.py` checks to `site/` as well as `README.md`, marking planned items (`plan-only` / `every-step` check-ins, non-sandboxed adapters) explicitly, and stating today's runnable seats (`Claude Code` and `Codex`) plainly. |
| Could a research statistic drift from its source or violate `AGENTS.md` rule 5? | Every research figure in `README.md`, `site/`, and the generated SVGs reads directly from `docs/research/second-checker/inputs.json` and `docs/research/user-demand-2026-11/`; the 200-perspective audit is computed by `docs/research/outside-perspectives-2026-11/evaluate.py` with recorded SHA-256 digests. |
| Could `site/` violate offline or third-party register rules? | `site/` loads zero external fonts, scripts, analytics, or CDN assets; `scripts/build-site.mjs` and `scripts/serve-site.mjs` reuse the repository's already-registered `Inter`, `JetBrains Mono`, and `Lobe Icons` marks (serving `LICENSE` alongside the marks with a non-affiliation notice) without committing duplicate font binaries. |
| Why is the GitHub Pages workflow staged in `deploy/github-pages.yml` instead of `.github/workflows/`? | `.github/` is a trust surface; under `docs/collaboration.md#sole-maintainer-sign-off`, a maintainer sign-off must reply to a question naming the open pull request as it stood when asked. Staging `deploy/github-pages.yml` avoids touching `.github/` prematurely. |
| Could this collide with open pull requests #170 or #174? | Checked against `#170` and `#174` file lists: neither touches `README.md`, `site/`, `apps/web/e2e/readme-shots.spec.ts`, `docs/assets/readme/`, `docs/quickstart-check.md`, or `deploy/`. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Every claim in `trace.md` has verified evidence in `verification.md` and no trust surface is modified.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
