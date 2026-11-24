# Ship: Site landing page and README overhaul

**Change slug:** `landing-and-readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-24

---

## Release identity

- **Branch:** `feat/landing-and-readme-overhaul`
- **Intended release window:** owner review on pull request; independent of open PRs #170 and #174.

## Scope and exclusions

- **Included:** `site/`, `scripts/build-site.mjs`, `scripts/serve-site.mjs`, `scripts/test/site.test.mjs`, `README.md`, `docs/quickstart-check.md`, `docs/README.md`, `docs/research/second-checker/`, `docs/research/outside-perspectives-2026-11/`, `docs/assets/readme/`, `apps/web/e2e/readme-shots.spec.ts`, `deploy/github-pages.yml`, `deploy/README.md`, and this packet.
- **Excluded:** `.github/`, `policies/`, `tests/redteam/`, `kernel/`, `spec/`, `docs/adr/`, `AGENTS.md`, and `apps/web/src/*`.

## Residual risks and gaps

| Risk or gap | Owner | Recheck trigger |
|---|---|---|
| Visual pass requires the owner's yes on 1440px and 390px screenshots (`design/references/README.md`). | Ben Huffer | Pull request review. |
| Enabling automatic GitHub Pages deployment requires moving `deploy/github-pages.yml` to `.github/workflows/pages.yml` with a sole-maintainer sign-off naming that PR. | Ben Huffer | When ready to publish GitHub Pages. |
| The 200-perspective audit uses modeled persona/cohort weights, not live user interviews. | Ben Huffer | Real user onboarding telemetry / interviews. |
| The `readme-shots` CI workflow will re-render `docs/assets/readme/app/*.png` on the pull request branch when `readme-shots.spec.ts` changes. | Ben Huffer | First `readme-shots` run on the PR. |

## Rollback / restore plan

Revert the squash commit on `main`. No database migration, kernel state, or runtime contract is touched.

## Monitoring and post-release checks

| Signal | Threshold / expected behavior | Owner | Where to inspect | Action if bad |
|---|---|---|---|---|
| README rendering on GitHub | All SVG diagrams, PNG screenshots, and relative links render cleanly | Ben Huffer | Repository front page | Fix forward |
| `readme-shots` workflow run on PR | Passes and commits refreshed PNGs only under `docs/assets/readme/app/` | Ben Huffer | GitHub Actions | Fix fixture in `readme-shots.spec.ts` |
| Static landing page (`site/`) | Zero console errors or third-party requests at 1440px and 390px | Ben Huffer | Local preview / GitHub Pages | Fix forward |

## Release decision

- **Decision:** pending owner visual review and green CI.
- **Decision maker:** Ben Huffer.
- **Trust surfaces touched:** none.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Owner approves screenshots and copy (`design/references/README.md`) and CI is green.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
