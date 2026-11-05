# Verification: Reading comfort in the web app

**Purpose:** Show the evidence for each claim and how independent it is.

**Change slug:** `reading-comfort`
**Related basis:** `basis.md`
**Owner:** Ben Huffer
**Date:** 2026-11-05

---

All evidence is in `evidence/`; `evidence/SHA256SUMS` holds the digest of each file, produced by `sha256sum`. Every number below is read from those files, none is typed in.

| Evidence | File | What it shows |
|---|---|---|
| E-001 | `type-token-moves.txt` | Each declaration the move script changed (58), with selector, old size and new token. Scene selectors are absent by design. |
| E-002 | `contrast-and-type-scale.log` | The contrast scan's twelve lowest pairs, measured by `contrast.ts`, and the passing guard tests. |
| E-003 | `final-tests.log` | Web suite: 29 files, 267 tests, all pass. Includes three new run-log pause tests, written first: two failed before the control existed; the third (no pause on a finished run) already held. |
| E-004 | `final-tests.log`, `final-types.log`, `final-build.log` | Typecheck clean; production build passes, including the theme and office contract checks. |
| E-005 | `e2e-chromium.log` | Browser suite on Chromium: 156 passed, 20 skipped (reasons not examined), 1 failed. Includes the WCAG 2.2 AA scan of every place and reflow at 320px, both passing. |
| E-006 | `screenshots/` | Floor preview and office harness after the change at 1280px: no horizontal overflow, no clipped labels. |
| E-007 | `git diff --stat` at ship time | Changes confined to `apps/web`, `docs/` and this record. |
| E-008 | `baseline-test.log` | Before: 27 files, 257 tests, all pass. After adds 2 files and 10 tests. |
| E-009 | `offline-assets.log` | Offline-assets check passes with the new preload. |

## Claim status

| Claim | Method | Result | Gap |
|---|---|---|---|
| C-001 | Guard test over the three stylesheets | pass | Scene exemptions are a list in the test; a new scene selector must be added there. |
| C-002 | Contrast scan at test time | pass | Scans plain `#hex` and `var()` colours. Translucent, gradient and inherited colours are skipped, as stated in `contrast.ts`. The WCAG axe scan in E-005 covers rendered text. |
| C-003 | Stylesheet review and render check | pass | No test asserts the measure. |
| C-004 | Component tests | pass | None. |
| C-005 | Browser suite | pass | See the known failure. |
| C-006 | Diff scope | pass | None. |

## Known failure, not caused by this change

`e2e/phase3-exit.spec.ts:117` (keyboard: skip link first) fails: the first Tab stop is "Office", not "Skip to content". It fails the same way with this change stashed, so it predates it. It looks like a focus-order issue and was not investigated further.

## Environment note

The pinned Playwright expects a browser build this container does not have. The suite was run through a throwaway config that points at the preinstalled Chromium, with the reporter overridden so the committed `overlay-themes` evidence file was not rewritten. Firefox and WebKit were not run.
