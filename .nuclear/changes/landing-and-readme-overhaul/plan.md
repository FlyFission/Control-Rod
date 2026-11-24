# Plan: Site landing page and README overhaul

1. Create and validate `.nuclear/changes/landing-and-readme-overhaul/` before touching other repository files (`AGENTS.md` rule 1).
2. Build the scripted 200-perspective due diligence study under `docs/research/outside-perspectives-2026-11/` (`inputs.json`, `evaluate.py`, `outputs.json`, `reproduce.sh`, `SHA256SUMS`, `README.md`) to anchor every structural, visual, and messaging fix.
3. Extend `docs/research/second-checker/build.py` (reading verbatim from `inputs.json` and `user-demand-2026-11`) to generate publication-grade control-room SVGs (`council-loop.svg`, `evidence-board.svg`, `second-checker.svg`, `pr-receipt-card.svg`, `workflow-modes.svg`) with recorded digests in `outputs.json`.
4. Update `apps/web/e2e/readme-shots.spec.ts` for current `main` places (`Board`, `Workflow`, `Control room`, `Inbox` with a Software-mode code review card, `Plant`, `Packages`) and capture fresh release-build PNGs into `docs/assets/readme/app/`.
5. Build `site/` (`index.html`, `styles.css`, `app.js`, `README.md`), `scripts/build-site.mjs`, `scripts/serve-site.mjs`, `scripts/test/site.test.mjs`, `docs/quickstart-check.md`, and `deploy/github-pages.yml` (`deploy/README.md`).
6. Overhaul `README.md` and link new docs in `docs/README.md`.
7. Run public-claims, originality, offline-assets, owner-decisions, register, license-gate, Playwright screenshot verification, unit tests, and `.ng` strict-custody validation; record outputs and SHA-256 digests in `verification.md`.

## Not touched

- `policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/`, `docs/adr/`, `AGENTS.md`, and `apps/web/src/*` files modified in open PRs #170 and #174.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- All steps above pass automated checks and produce recorded digests in `verification.md`.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
