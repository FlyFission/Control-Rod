# Plan: Pre-marketing hardening and UX polish

1. Create local branch `fix/pre-marketing-hardening` and initialize `.nuclear/changes/pre-marketing-hardening/`.
2. Harden `services/api/src/` (`app.ts`, `work.ts`, `repos.ts`, `server.ts`, `auth.ts`, `db/migrate.ts`, `db/roles.ts`, `seals.ts`) for tenant scoping, run/completion integrity, atomic secret writes, SSE/shutdown safety, and `check_register.py` compliance.
3. Harden `daemon/` and `scripts/cr.mjs` (`daemon.go`, `client.go`, `sandbox.go`, `checker.go`, `cr.mjs`) for default-on author egress filtering, retryable 401 evidence/completions, `CODEX_HOME` isolation, and reliable process supervision.
4. Fix `apps/web/` resilience, Look B/C light-theme contrast, `NewWorkModal`/`ProjectModal`/`Setup`/`SignIn`/`Compare`/`Explore`/`Today`/`Policies`/`AgentsRoster`/`GeoMap`/`QuickAdd`/`Inbox` UX bugs, `check_public_claims.py` and `check_register.py` markers, and `phase3-exit.spec.ts`.
5. Refresh `README.md`, `docs/status.md`, `docs/getting-started.md`, and `CONTRIBUTING.md`.
6. Run verification checks, record exact results in `verification.md`, confirm zero trust-surface edits, and commit locally.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All non-trust-surface API, daemon, CLI, frontend, and documentation fixes land on `fix/pre-marketing-hardening`; `check_public_claims.py`, `check_register.py`, `check_owner_decisions.py`, `spec` build, `typecheck`, `build`, `apps/web` tests, `go vet`, and `tools` unit tests pass; no trust-surface files are modified.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
