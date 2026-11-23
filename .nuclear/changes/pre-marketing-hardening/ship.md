# Ship: Pre-marketing hardening and UX polish

Release decision: **Local branch `fix/pre-marketing-hardening` prepared for owner review; do not push until owner runs host Postgres/Go/live checks and reviews.**

- Rollback: discard or revert branch `fix/pre-marketing-hardening` (`main` at `69fe9698` is untouched).
- Trust surfaces: none modified (`git diff --name-only main | grep -E '^(policies|tests/redteam|\.github|kernel|spec|docs/adr)/'` empty).
- Remaining host verification before pushing/marketing: run `pnpm --filter @control-rod/api test`, `cd daemon && go test ./...`, `pnpm -C apps/web exec playwright test -c playwright.live.config.ts --project=chromium --trace off`, and `node tools/license-gate.mjs` outside the sandbox.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All non-trust-surface API, daemon, CLI, frontend, and documentation fixes land on `fix/pre-marketing-hardening`; `check_public_claims.py`, `check_register.py`, `check_owner_decisions.py`, `spec` build, `typecheck`, `build`, `apps/web` tests, `go vet`, and `tools` unit tests pass; no trust-surface files are modified.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
