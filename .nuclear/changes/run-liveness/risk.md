# Risk: run liveness after the agent is done

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-04 instruction to ensure Kandev's reported "stuck running" failures cannot happen here.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec major version. No wire field, schema or migration changes.
- Scope: `daemon/internal/runner` and `docs/daemon.md`.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The daemon ends a run that was still doing real work after its end-of-turn report, and records success on partial outputs. | Only the runtime's own top-level end-of-turn event counts (not text that mentions it); print mode has one turn; `out/` is snapshot while the run is frozen; the control plane still requires the completion record (P21) before success counts. A failed report fails the run. | A runtime that emits an end-of-turn event mid-run. |
| R-02 | A settled run hides a real non-zero exit. | Only a run whose process did not exit is settled; a process that exits keeps its exit status (test `exit 3`). | Settle overriding a process exit. |
| R-03 | Backoff delays a completion after a long control-plane outage. | Cap is 15 minutes; a daemon restart tries everything at once; nothing is dropped. | Completion loss, or a cap the owner finds too long. |
| R-04 | Raw logs still grow without a per-run total cap. | Lines clipped to 4000 characters and 500 per batch; events capped at 20000; the run timeout bounds the total. Not changed here: the raw log is the full record behind the event cap. | Owner decision to cap or summarise the raw log (would amend the run-events design). |
| R-05 | Removing launcher variables breaks a tool an agent needed. | Only lower-case `npm_*`/`pnpm_*`, `INIT_CWD`, `PNPM_SCRIPT_SRC_DIR` and launcher `PATH` entries; user `NPM_CONFIG_*`, `PNPM_HOME` and the daemon's own `bin` entries stay. | An agent tool that depended on them; the ADR 0021 allowlist is the end state anyway. |

## Selected mode

- **Mode:** Standard
- Basis: changes when the daemon ends a run and what reaches an agent's environment; no protected surface, contract or persisted record shape changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

RL-01 to RL-04 are implemented with failed-first regression evidence and a green race suite; the open storage item and real-runtime gap are stated for the owner. No fake-runtime result is presented as real-runtime proof.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
