# Ship: Reading comfort in the web app

**Purpose:** State the merge decision plainly.

**Change slug:** `reading-comfort`
**Owner:** Ben Huffer
**Date:** 2026-11-05

---

## Release identity

- **Branch:** `claude/eloquent-galileo-3mzmkk`
- **Intended release window:** with the next web build.

## Scope

- **Included:** type tokens and readable-text step, line height and measure for logs, previews and agent prose, pause control on run logs, contrast and type-scale guards, mono font preload, `docs/reading-comfort.md`.
- **Excluded:** light mode, text-size setting, scene label sizes, break reminders, editor and terminal settings. See `basis.md`.
- **Non-goal:** any claim about eye strain or health.

## Evidence status

| Area | Status | Link |
|---|---|---|
| Typecheck, tests, build | pass | `verification.md` E-003, E-004 |
| Contrast and type scale | pass | E-002 |
| Browser suite | 1 known failure that predates the change | E-005 |
| Trust surfaces | none edited | E-007 |

## Rollback

Revert the commit. The type steps and measure are tokens in `tokens.css`; setting `--fs-chip`, `--fs-label`, `--fs-small` and `--fs-ui` back to 9, 11, 12 and 13 restores the old sizes without touching rules, though the type-scale test would then fail on purpose.

## Decision

Merge after review. No signature is needed because no trust surface is edited.
