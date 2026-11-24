# Risk: control room and the usage-limits module

- **Mode:** Standard
- **Status:** In build, for owner review.
- Decision owner: Ben Huffer. No kernel decision function, policy, red-team fixture or workflow is edited. The spec change is additive inside API 0.1.
- Scope: `spec/api.tsp` (usage-limit models, `GET /usage/limits`, an optional claim field) and regenerated files; `services/api` (store and serve the reading); `daemon/internal/runner` (read Codex's session log and Claude Code's stream events); `apps/web` (the control room place); `docs/adr/0025-usage-engine.md` (a trust surface: needs the owner's recorded yes).

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | Reading Codex's session log keeps prompt text or account material. | Only the tail of the newest files is read, and only the `rate_limits` fields are decoded into a narrow struct. The API keeps only contract fields and drops a plan name that looks like a credential. | A test or a report that carries prompt text or a planted token. |
| R-02 | A reading is shown as current after its window has reset, so the person trusts a stale number. | Each reading carries when the CLI recorded it. The page shows its age, and hatches a window whose reset time has passed. The daemon drops a Claude window once its reset time passes. | A window shown without its age, or shown as current after its reset. |
| R-03 | A harness with no source is shown as 0% used. | A provider with no source is listed as not reported, with no bar. | A bar for a provider whose source is none. |
| R-04 | Claude Code's `utilization` scale is not documented, so a reading is off by 100x. | Values up to 1 are read as a fraction, larger values as a percent. Recorded as an assumption; a real 1% reading would show as 100%. | A live Claude reading that disagrees with Claude Code's own `/usage`. |
| R-05 | CodexBar, which reads sign-ins itself, leaks account details into Control Rod or pops a prompt the person did not expect. | Owner chose CodexBar (basis D4); ADR 0025 records the rule. Only numbers are decoded; account, email, diagnostic and error text are never decoded. Runs in the background with `CODEXBAR_DISABLE_KEYCHAIN_ACCESS=1`, stdin closed, a 60 s limit, and never for Claude Code or Codex. `CONTROLROD_CODEXBAR=off` disables it. | A report carrying a planted email or token; any `codexbar` call naming claude or codex. |

## Selected mode

- **Mode:** Standard
- Basis: a read-only page, an additive API field and a passive reader of files the CLI already writes. Reversible by revert. No protected surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
