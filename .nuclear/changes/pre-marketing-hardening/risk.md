# Risk: Pre-marketing hardening and UX polish

- **Mode:** Standard
- Execution owner: Antigravity agent (orchestrating due-diligence fixes).
- Decision owner: Ben Huffer. No trust surface is edited (`policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/`, `docs/adr/`).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Defaulting `CONTROLROD_EGRESS_FILTER` on breaks existing fake-runtime tests or blocks local tool runs. | Enable by default for real runtimes (`CONTROLROD_EGRESS_FILTER` unset or not `0`/`false`), keep fake-runtime opt-in (`=1`), and update `daemon_egress_test.go`. | Existing egress tests fail or local author run cannot reach its runtime provider host. |
| R-02 | Changing `SessionGate` or `NewWorkModal` state lifecycle drops session-change isolation or breaks existing React tests. | Keep `SessionGate` keyed by `sessionIdentity` and only keep `<Shell>` mounted when `session.data` is valid; run full `apps/web` Vitest suite after edits. | Any regression in `session-gate.test.tsx` or `newwork.test.tsx`. |
| R-03 | Changing `auth.ts` cookie `secure` attribute breaks local `http://localhost` sign-in. | Only set `secure: true` when `https:` origin is configured and host is not loopback, keeping `http://localhost` / `http://127.0.0.1` working. | WebAuthn sign-in fails on local `http://localhost:7300`. |
| R-04 | Unintentionally touching a trust-surface directory without sign-off. | Verify `git diff --name-only main` contains zero paths in `policies/`, `tests/redteam/`, `.github/`, `kernel/`, `spec/`, or `docs/adr/`. | Any file in a trust-surface directory appears in the diff. |

## Selected mode

- **Mode:** Standard
- Basis: Reliability, security, UX, and documentation fixes across non-trust-surface paths (`apps/web/`, `services/api/`, `daemon/`, `scripts/`, `docs/`, `README.md`, `CONTRIBUTING.md`).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

All non-trust-surface API, daemon, CLI, frontend, and documentation fixes land on `fix/pre-marketing-hardening`; `check_public_claims.py`, `check_register.py`, `check_owner_decisions.py`, `spec` build, `typecheck`, `build`, `apps/web` tests, `go vet`, and `tools` unit tests pass; no trust-surface files are modified.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
