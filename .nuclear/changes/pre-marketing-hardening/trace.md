# Trace: Pre-marketing hardening and UX polish

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| PM-01 Fix API tenant scoping, completion/refusal safety, nuclear-mode tag parsing, and HTTP/SSE/startup hardening | `services/api/src/{app.ts,work.ts,repos.ts,server.ts,auth.ts,db/migrate.ts,db/roles.ts,seals.ts}` | `pnpm --filter @control-rod/api typecheck`, `build`, `wave3-outfall.test.ts` (4/4 pass); `services/api` Postgres suites blocked on macOS host `initdb` (`shmget: No space left on device`) | implemented |
| PM-02 Default author egress filter on, make 401 evidence/completion retryable, isolate `CODEX_HOME`, harden `cr.mjs` | `daemon/internal/runner/{daemon.go,client.go,sandbox.go,checker.go,daemon_egress_test.go}`, `scripts/cr.mjs` | `gofmt`, `go vet ./...`, `go test ./...` (pass in 32.07s), `pnpm cr doctor` | implemented |
| PM-03 Fix frontend resilience (`SessionGate`, `client.ts`, `firstRun.ts`), Look B/C contrast (`styles.css`), onboarding/pages (`SignIn`, `Setup`, `NewWorkModal`, `ProjectModal`, `Compare`, `Explore`, `Today`, `Policies`, `AgentsRoster`, `GeoMap`, `QuickAdd`, `Shell`, `ThemedFloor`, `BoardReviewDrawer`, `Inbox`, `CommandForm`), e2e & gate markers | `apps/web/src/**`, `apps/web/e2e/phase3-exit.spec.ts` | `pnpm --filter @control-rod/web test -- --run` (54 files, 734 tests pass), `pnpm run build`, `check_public_claims.py`, `check_register.py` | implemented |
| PM-04 Refresh `README.md`, `docs/status.md`, `docs/getting-started.md`, and `CONTRIBUTING.md` | Root docs and guides | `check_public_claims.py`, `check_register.py`, `check_agents_map.py`, `check_owner_decisions.py` | implemented |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All non-trust-surface API, daemon, CLI, frontend, and documentation fixes land on `fix/pre-marketing-hardening`; `check_public_claims.py`, `check_register.py`, `check_owner_decisions.py`, `spec` build, `typecheck`, `build`, `apps/web` tests, `go vet`, and `tools` unit tests pass; no trust-surface files are modified.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
