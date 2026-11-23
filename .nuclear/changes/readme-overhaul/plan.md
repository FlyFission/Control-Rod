# Plan: README overhaul

**Change slug:** `readme-overhaul`
**Owner:** Ben Huffer
**Date:** 2026-11-23
**Branch:** `claude/project-thread-thvi8k`

---

1. List open pull requests and diff each against `main` for README, docs index, status and screenshot paths.
2. Read what shipped: `docs/status.md`, router places, runtimes list, change records for the board, context toggle, workbench and adapters.
3. Add the board shot to `readme-shots.spec.ts`, run it against the release build in Chromium, and look at the pictures.
4. Rewrite `README.md`; run `tools/check_public_claims.py` and `tools/check_originality.py`.
5. Open a draft pull request. Rebase and revise when #135, #136 and #137 land.

## Affected files

`README.md`, `apps/web/e2e/readme-shots.spec.ts`, `docs/assets/readme/app/*.png`, this record.

## Not touched

`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/`, `kernel/`, `docs/status.md`.

## Rollback

Revert the commit.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

- A reviewer can repeat every result from `verification.md`.

## Source-lineage note

Structure follows nuclear-grade context engineering; public source map at https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md. No compliance claim is made.
