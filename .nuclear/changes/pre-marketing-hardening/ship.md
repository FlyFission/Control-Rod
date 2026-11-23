# Ship: Pre-marketing hardening and UX polish

Release decision: **Branch `fix/pre-marketing-hardening` pushed to `origin` with a draft PR targeting `main`, pending CI and owner review.**

- Rollback: close the draft PR and delete or revert branch `fix/pre-marketing-hardening` (`main` at `69fe9698` is untouched).
- Trust surfaces: none modified (`git diff --name-only main | grep -E '^(policies|tests/redteam|\.github|kernel|spec|docs/adr)/'` empty).
- Host/CI verification limits: macOS host hit SysV shared memory limits (`shmget: No space left on device`) during embedded Postgres `initdb` in the 59 DB-backed API test files; the non-DB API tests, web Vitest suite, TypeSpec/TS builds, and Python gates passed locally, and the Linux CI workflow on the draft PR exercises the full PostgreSQL API suite, Rust kernel suite, Go daemon suite, Python SDK suite, license gate, and `--strict-custody` check.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All non-trust-surface API, daemon, CLI, frontend, and documentation fixes land on `fix/pre-marketing-hardening`; `check_public_claims.py`, `check_register.py`, `check_owner_decisions.py`, `spec` build, `typecheck`, `build`, `apps/web` tests, `go vet`, and `tools` unit tests pass; no trust-surface files are modified.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
