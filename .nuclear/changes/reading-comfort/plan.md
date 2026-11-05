# Plan: Reading comfort in the web app

**Purpose:** Keep the change small and its proof repeatable.

**Change slug:** `reading-comfort`
**Owner:** Ben Huffer
**Date:** 2026-11-05
**Branch:** `claude/eloquent-galileo-3mzmkk`

---

## Charter and anchor check

| Check | Result |
|---|---|
| Objective matches `risk.md#mission-anchor` | yes |
| Any work outside the non-goals? | no |
| Scope change during the work | none |

## Build sequence

1. Read the report; read how the web app sets type, colour, motion and live output.
2. Measure first: write the contrast scan and run it on the unchanged stylesheets (it passed, so contrast needed no change).
3. Move readable text onto type tokens with a script that skips scene art; keep the move list (`evidence/type-token-moves.txt`).
4. Add `--lh-mono` and `--measure`; apply to logs, previews and agent prose.
5. Write the pause tests for the run log, watch them fail, then add the control.
6. Add the type-scale guard, preload the mono font, write `docs/reading-comfort.md`.
7. Typecheck, test, build, run the browser suite, look at the floor and office pages.

## Affected files

`apps/web/src/design/tokens.css`, `styles.css`, `features/floor/floor.css`, `features/office/office.css`, `components/RunLog.tsx`, `components/components.test.tsx`, `index.html`; new `design/contrast.ts`, `design/contrast.test.ts`, `design/type-scale.test.ts`; `docs/reading-comfort.md`, `docs/README.md`.

## Not touched

`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`, `kernel/`. No new dependency, font file or network request.

## Agent briefing

The AI agent works on the branch above only, runs local builds and tests, pushes, and opens a draft pull request. It does not merge.
