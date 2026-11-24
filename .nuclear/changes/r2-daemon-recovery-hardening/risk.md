# Risk: Phase 2 daemon recovery hardening (#118/#119 remainder, #120)

- **Mode:** Standard
- Execution owner: authoring agent under the 2026-11-24 ten-x amendment program, Phase 2.
- Decision owner: Ben Huffer. No protected surface (`policies/`, `tests/redteam/`, all of `.github/`, `docs/adr/`, `spec/` major versions, kernel decision functions) is modified.
- Scope: `services/api/test/runs.test.ts`, `services/api/test/harness.ts` (test-only helper), `daemon/internal/runner/checkout_hardening_test.go`, `docs/daemon.md`, `docs/status.md`, and this record. No production code changes.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The audit tests assert implementation details (row-status strings, error wording) rather than the custody behavior they exist to pin, so a refactor keeps them green while the guarantee is gone. | Each test names the behavior in its title and asserts the externally observable contract: exactly one claim wins and its token completes a run; a refused second run leaves no directory; a restarted control plane honours an existing token and replays a receipt. Row status and refusal code are asserted only where they are the contract (`running`, `already-complete`). | Any assertion that pins a log line, timing or internal field rather than the contract above. |
| R-02 | The recovery matrix in `docs/daemon.md` overstates coverage: a row reads as fault-injected while its test exercises only the happy path, or names a test that does not exist. | Every row names the test that pins it, by file and test name, as written in this change; rows whose behavior was only traced, not tested, say so in the row (the macOS post-restart limitation and `ErrUncontained` receipt paths cite their tests or state the person-reconciliation outcome). | Any matrix row whose named test does not fail when the row's expected behavior is broken. |
| R-03 | A test claims a fault was injected when the environment only simulated its control-plane reply (fake control plane, fake runtime, in-process app restart), presenting the matrix as live-agent qualification. | `ship.md` states what was not run: no live Claude Code or Codex process, no OS-level network partition, no process kill of the API; the restart test builds a second app instance over the same Postgres, which is the custody-relevant part of a restart. | Any claim in the record, the matrix or `docs/status.md` that a live agent or a killed API process was exercised. |
| R-04 | Test pollution: the new API tests leave queued runs (a package's pre-check) that later tests in the same file claim by mistake, producing failures unrelated to the change. | Each new API test drains the pre-check it creates, in the file's existing style; the failure mode was observed once during development (six downstream failures) and fixed before commit. | A full `pnpm test` run in `services/api` that is not green. |

## Selected mode

- **Mode:** Standard
- Basis: tests and documentation only; no production code, contract, migration or trust surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship.md).

## Exit criteria

1. The #135 remainder is audited against #118 and #119 with the outcomes recorded, and any gap is filed as a narrow issue, not a reopen.
2. #120's six behaviors (lease acquisition, heartbeat, cancellation/SCRAM, process-tree termination, completion retry, outbox replay) are traced in `daemon/internal/runner/daemon.go` and written up as a one-page recovery matrix under `docs/`, one row per fault with expected behavior, observed behavior and the deterministic test that pins it.
3. The deterministic fault-injection tests the matrix demands exist and pass: concurrent claims, checkout custody exclusion, control-plane restart, and the previously covered network-loss, SIGKILL-orphan-sweep, timeout, lost/late-completion and duplicate-completion rows.
4. `cd services/api && pnpm test` and `cd daemon && go test ./...` are green.
5. #120 is closed with the matrix and tests as evidence, or split; `docs/status.md` changes only PR-citable facts.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
