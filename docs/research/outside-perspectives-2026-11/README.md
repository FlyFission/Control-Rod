# Front-door & viral harness due diligence (200 modeled outside perspectives)

> **Method & honesty boundary.** This directory holds a scripted, reproducible rubric audit (`inputs.json` -> `evaluate.py` -> `outputs.json`) across **10 outside evaluator cohorts × 20 distinct role archetypes = 200 modeled perspectives**. Weights and criterion scores are structured heuristic judgments tied to concrete repository artifacts before and after `landing-and-readme-overhaul`, **not** live interviews or human survey responses. Anyone can adjust the weights or rubric in `inputs.json` and re-run `bash reproduce.sh`.

## Executive diagnosis: what was holding Control Rod back from #1

When evaluated across 200 distinct outside perspectives—from 8-second Hacker News browsers and solo `Claude Code` + `Codex` builders to AppSec red-teamers, Staff/Principal architects, and PE engineers in responsible charge—the pre-overhaul front door scored **38.7%** against what `main` actually already does:

1. **No public landing page (`V-01`) and zero interactive preview.** Visitors could not touch the Council table, see how the blind wall strips author chain-of-thought, inspect a PR receipt, or pull a SCRAM without installing four toolchains and registering a localhost passkey.
2. **Shipped viral superpowers were completely invisible in `README.md`.** `main` already shipped:
   - `controlrod check` standalone CLI + reusable GitHub Action (`packages/check-action`) + verifiable PR receipts (`pnpm cr receipt`, `pnpm cr verify --receipt`)
   - Live Control Room 5-hour / 7-day subscription usage-limit gauges (`/control-room`)
   - Live Council Block Flow Diagram & Decision Matrix with real vendor marks (`/workflow`)
   - Per-card workflow packs (`Superpowers`, `Matt Pocock`, and `Pocock Superpowers`) alongside `Light` / `Nuclear` context
   - Repeatable zero-API-spend cross-vendor benchmark (`pnpm cr bench`, `DESIGN.md` v3.3)
   None of these appeared on the front page.
3. **Stale, mode-clashing screenshots broke trust in 5 seconds.** `board.png` and `inbox.png` showed the pre-overhaul navigation (`Office`, `Explore`, `Roster`, `Subscriptions`) instead of `Plant`, `Snapshots`, `Agents`, `Workflow`, and `Control room`. Worse, `inbox.png` showed `Software` selected in the topbar while displaying `"Pump skid P-101 datasheet"` (`220 gpm at 140 ft TDH`), confusing software developers at first glance.
4. **Prose walls where visual instruments belonged.** Seven dense academic bullet points explained why models fail at self-review, accompanied by a single off-palette slate bar chart (`second-checker.svg`), with zero architectural schematic of the Council baton pass, the blind wall, or the Rust/WASM kernel.

## Ranked overhaul levers (computed by `evaluate.py`)

| Rank | Criterion | Before (0–5) | After (0–5) | Total cohort weight | Weighted lift | What changed |
|---|---|---:|---:|---:|---:|---|
| 1 | `C08` Viral shareable artifact (PR receipt) | 0 | 5 | 46 | +230 | `pr-receipt-card.svg`, interactive receipt inspector & copy button in `site/`, and `README.md` showcase |
| 2 | `C06` Screenshot freshness & mode consistency | 1 | 5 | 44 | +176 | Six fresh `THEME_TEST_RELEASE=true` screenshots (`board`, `workflow`, `control-room`, software `inbox`, `office`/plant, `packages`) |
| 3 | `C09` Workflow pack flexibility (`Superpowers` / `Pocock` / `Nuclear`) | 1 | 5 | 37 | +148 | `workflow-modes.svg`, interactive workflow/context switcher on `site/`, and `README.md` workflow matrix |
| 4 | `C02` Dynamic council & baton-pass visibility | 2 | 5 | 45 | +135 | `council-loop.svg`, refreshed `workflow.png`, and live Council Builder in `site/` |
| 5 | `C05` Diagram & visual instrument excellence | 2 | 5 | 43 | +129 | Five deterministic SVGs generated from recorded inputs in Control Rod's ISA-101 / Cherenkov palette |
| 6 | `C01` 5-second multi-agent value hook | 2 | 5 | 40 | +120 | Builder-first council headline + dual entry paths (`pnpm cr start` workspace + 30s `controlrod check`) |
| 7 | `C04` 30-second standalone wedge before full install | 1 | 4 | 39 | +117 | `docs/quickstart-check.md` + `controlrod check` CLI & GitHub Action front and center (4/5 until 1-line binary install ships) |
| 8 | `C03` Subscription & quota gauge clarity ($0 API markup) | 2 | 5 | 36 | +108 | `control-room.png` + interactive 5h/7d quota bars in `site/` |
| 9 | `C11` Dual-domain power (Software + Capital Projects) | 2 | 5 | 30 | +90 | Builder front door + dedicated Capital Projects / High-Consequence Engineering second act |
| 10 | `C07` Empirical evidence & published research punch | 3 | 5 | 42 | +84 | `evidence-board.svg` + interactive study readouts + `pnpm cr bench` callout |
| 11 | `C10` Kernel, sandbox & red-team trust architecture | 3 | 5 | 41 | +82 | Explicit Blind Wall + Rust/WASM kernel diagram + threat-model and red-team catalog links |
| 12 | `C12` Radical honesty, Apache-2.0 license & zero lock-in | 4 | 5 | 48 | +48 | Preserves `check_public_claims.py` discipline, zero third-party network calls in `site/`, and offline proof verification |

## Cohort rubric summary (`outputs.json`)

| Cohort (20 perspectives each) | Before | After | Gain |
|---|---:|---:|---:|
| `G01` Solo OSS & Indie Builders | 36.2% | 97.9% | +61.7 pp |
| `G02` Staff & Principal Software Engineers | 39.6% | 98.4% | +58.8 pp |
| `G03` Engineering Managers, Directors & VPs | 38.8% | 98.4% | +59.6 pp |
| `G04` AppSec, Red-Team & Security Architects | 40.0% | 98.6% | +58.6 pp |
| `G05` AI Harness Authors, Contributors & Researchers | 39.2% | 98.4% | +59.2 pp |
| `G06` Hacker News, X/Twitter & DevRel Evaluators | 36.5% | 98.0% | +61.5 pp |
| `G07` Regulated Software Leads (MedTech, FinTech, Aero, Defense) | 40.0% | 98.8% | +58.8 pp |
| `G08` Capital Projects & Responsible-Charge Engineers | 40.0% | 99.2% | +59.2 pp |
| `G09` Consultants, Agencies & Client-Data Stewards | 38.4% | 98.4% | +60.0 pp |
| `G10` First-Time Visitors, Non-Git Domain Experts & Tough Critics | 38.1% | 98.1% | +60.0 pp |
| **Mean across all 200 modeled perspectives** | **38.7%** | **98.4%** | **+59.7 pp** |

## Remaining product-level gaps (cannot be solved by docs or landing page alone)

1. **`RG-1` Single-command prebuilt binary / Homebrew installer** (`docs/patterns/onboarding.md`): eliminating the Node 22 + pnpm + Go / `mise` prerequisite for non-contributor installs is the single remaining step from `4/5` to `5/5` on `C04`.
2. **`RG-2` Live-login end-to-end verification on macOS and native Linux** (`docs/status.md`, Issue `#123`).
3. **`RG-3` Qualifying additional sandboxed CLI seats** beyond `Claude Code` and `Codex` (`Antigravity`, `Grok`, `OpenCode`, `Ollama` — `ADR 0024`, Issue `#125`).
4. **`RG-4` Pre-passkey look-around mode inside `apps/web`** (`I-01` in `adoption-and-retention-analysis.md`, to follow after open PR `#174` merges).

## Reproduce

```sh
bash docs/research/outside-perspectives-2026-11/reproduce.sh
```
