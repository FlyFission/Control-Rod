# Basis: Site landing page and README overhaul

**Related risk record:** `risk.md`
**Change slug:** `landing-and-readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Decision this basis supports:** whether the standalone `site/` landing page, overhauled `README.md`, deterministic SVG diagrams, refreshed release-build screenshots, 30-second standalone check quickstart, and 200-perspective due diligence study may merge to `main`.

---

## Mission / need

Since the earlier `readme-overhaul` (#149/#152), `main` has shipped major council-first capabilities that the front page either omits or shows with outdated screenshots: the Plant console and Control Room visual overhaul (#153, #168), movable Control Room subscription usage-limit gauges (#171), live Council Block Flow Diagram and Decision Matrix with vendor marks (#173), first-run Setup and Agents roster (#158), Superpowers and Matt Pocock per-card workflows (#155), scoped send-back (#169), worktree-bound author runs (#135), standalone `controlrod check` CLI, reusable GitHub Action and verifiable PR receipts (#136), and the repeatable cross-vendor benchmark `pnpm cr bench` (#160). In addition, `FlyFission/Control-Rod` had no public marketing/demo landing page (`V-01` in `docs/superpowers/specs/2026-11-08-adoption-and-retention-analysis.md`), and the old `inbox.png` screenshot mixed Software mode in the topbar with a mechanical pump datasheet card.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Overhaul the site landing page and README from outside perspectives with stronger diagrams, screenshots, and viral additions. | "Do a full due diligence of the site landing page and readme, which need a significant overhaul based on the direction we're going.  More intuitive.  More exellent, more beautiful.  Better diagrams and pictures.  Everything is on the chopping block.   Create high value additions for a repo that truly has viral potential.  Review this from hundreds of outside perspectives and tailor accordingly.  We want to be the #1 harness." | 2026-11-24, Antigravity session d4c993a8 | Conduct a scripted multi-perspective audit, overhaul `README.md`, build the landing page, refresh visuals and screenshots, and add viral entry points. | Kernel, contract, daemon, API, or policy changes. |
| D2 | Emphasize the multi-agent council dynamic, strongest empirical evidence, and 10X catchier presentation. | "I really want to lean into the multi-agent approach and dynamic and ensure we have the strongest evidences to present.  It's needs to be 10X catchier." | 2026-11-24, Antigravity session d4c993a8 | Lead with multi-agent seating, dynamic baton-pass workflows, blind cross-vendor checking, and script-generated visual evidence from published studies. | Inventing unmeasured cross-vendor catch percentages or claiming compliance. |
| D3 | Build the standalone static marketing and interactive demo landing page in `site/` alongside `README.md`. | "(Recommended) Build a new standalone static marketing & interactive demo site in `site/` (ready for GitHub Pages or custom domain, no conflict with open PR #174) alongside the `README.md` overhaul" | 2026-11-24, Antigravity session d4c993a8 | Create `site/` plus `scripts/build-site.mjs` and `scripts/serve-site.mjs` without editing `apps/web/src/*` files touched by PR #174. | Modifying `apps/web/src/*` entry routes while PR #174 is open. |
| D4 | Lead as the AI Council Harness for builders, with Capital Projects / Nuclear-Grade as the second act. | "(Recommended) Lead as the #1 AI Council Harness for builders (seat every CLI you already pay for, blind cross-vendor check, quota gauges, Superpowers/Pocock workflows, standalone `controlrod check` + PR receipts), with Capital Projects / Nuclear-Grade as the powerhouse second act" | 2026-11-24, Antigravity session d4c993a8 | Frame hero and primary tour around software builders and multi-agent council workflows, followed by Capital Projects and Nuclear-Grade rigor. | Dropping Capital Projects or overstating non-runnable CLI seats. |
| D5 | Include all proposed viral additions so the owner can review and trim anything unwanted. | "Lets try all of these and we delete what doesnt make sense?" | 2026-11-24, Antigravity session d4c993a8 | Ship interactive `site/` widgets, refreshed screenshots and bespoke SVGs, `docs/quickstart-check.md`, harness comparison matrix, 200-perspective audit, and a staged GitHub Pages workflow in `deploy/github-pages.yml`. | Editing `.github/workflows/` directly before an open pull request exists for sole-maintainer sign-off (`docs/collaboration.md#sole-maintainer-sign-off`). |

## Fixed inputs

- Current `main` at `51a9e7e`, `docs/status.md`, `ADR 0024`, `design/references/README.md`, and `design/references/screens.md`.
- Published study inputs in `docs/research/second-checker/inputs.json` and demand study outputs in `docs/research/user-demand-2026-11/personas/outputs.json` and `repos/counts_all.json`.
- Registered fonts (`apps/web/public/fonts/*.woff2`) and Lobe Icons marks (`apps/web/public/agent-marks/*.svg` and `LICENSE`).

## What changes

- `site/` (`index.html`, `styles.css`, `app.js`, `README.md`, `.gitignore`) plus `scripts/build-site.mjs`, `scripts/serve-site.mjs`, and `scripts/test/site.test.mjs`: zero-dependency, self-hosted interactive landing page with live Council & Workflow builder, Blind-Wall & PR Receipt inspector, Empirical Evidence panel, Plant & SCRAM console simulator, Software / Capital Projects switcher, and Harness Comparison matrix.
- `docs/research/second-checker/build.py` and `outputs.json`, generating `docs/assets/readme/second-checker.svg`, `docs/assets/readme/evidence-board.svg`, `docs/assets/readme/council-loop.svg`, `docs/assets/readme/pr-receipt-card.svg`, and `docs/assets/readme/workflow-modes.svg`.
- `apps/web/e2e/readme-shots.spec.ts` and refreshed PNGs in `docs/assets/readme/app/` (`board.png`, `workflow.png`, `control-room.png`, `inbox.png`, `office.png`, `packages.png`) using mode-consistent fixtures against the release build.
- `README.md`, `docs/quickstart-check.md`, `docs/README.md`, `deploy/github-pages.yml`, and `deploy/README.md`.
- `docs/research/outside-perspectives-2026-11/` (`inputs.json`, `evaluate.py`, `outputs.json`, `reproduce.sh`, `SHA256SUMS`, `README.md`): scripted 200-perspective due diligence audit across 10 outside evaluator cohorts.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Only Claude Code and Codex run author and checker jobs today; Antigravity, Grok, OpenCode, and Ollama are detected and listed until confined. | `docs/status.md`, `apps/web/src/lib/runtimes.ts`. | Additional CLI adapters qualify for sandboxed execution on `main`. |
| Live human stops today are signed release and signed acceptance; `plan-only` and `every-step` presets are saved preferences marked coming soon. | `ADR 0024` decision 7; `apps/web/src/lib/agents.ts`. | Kernel standing-acceptance and per-stage check-in gates ship. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- Builder and reviewer can trace every claim, screenshot, diagram, and empirical number in `README.md` and `site/` to `main` code or recorded scripts.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
