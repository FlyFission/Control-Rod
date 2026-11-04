# Basis: run liveness after the agent is done

**Change slug:** `run-liveness`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-04
**Decision this basis supports:** whether the daemon changes below can merge as guards against the failure class reported for another agent workbench.

## Mission / need

A Kandev 0.98.0 user reported (2026-10-30, supplied by the owner as a bug report write-up, not Kandev docs or source) that chat sessions stay "Running" for an hour after the agent's reply is complete; background subagent rows never leave "running"; a "turn change set not found" error is retried every 5 seconds forever; storage grows quickly; and the managed runtime's `npm_config_*` variables leak into user shells. The owner asked that Control Rod be made safe from the same failures. No Kandev code, schema or text is used; this record maps each reported failure onto Control Rod's own design.

## Mapping of the report onto Control Rod

| Reported failure | Control Rod before this change | Disposition |
|---|---|---|
| A turn whose reply is complete stays RUNNING until a manual cancel | Print-mode runs end only when the process exits. A runtime that reported its final result but kept running (background job, hung hook or child) showed as running until the 45-minute timeout and was then recorded `failed: timeout`, losing finished work. | **Fixed.** The runtime's own end-of-turn report ends the run after a settle window (`SettleAfter`, 30 s). RL-01. |
| Background subagents stay "running" forever | No per-subagent records exist. `Task` is not in any allowlist. Processes left behind are ended when the leader exits (containment unit). But a Claude background shell could keep the leader, and so the run, open. | **Fixed at the source.** Claude Code runs get `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`; RL-01 ends anything that still lingers. RL-02. |
| Stall detected, session kept RUNNING | The breaker trips on runaway tool use; the lease sweep retires a silent daemon as `lost`, never as success; the run timeout bounds a silent runtime. | No change. An idle-output watchdog was considered and not added: long tools are legitimately silent, and the timeout already bounds the case. |
| Cancel not acknowledged, session silently reset | The stop ladder ends the whole containment unit; a unit that cannot be confirmed empty keeps its receipt, sends no completion and leaves the outcome unknown until a sweep confirms it. Nothing is reset silently. | No change. |
| Queued prompts rejected; "send now" loses a message; mid-turn steering never arrives | One prompt per run; there are no mid-run messages to queue or lose. | Not applicable. |
| "Not found" retried every 5 s forever | An unknown run is a 404 refusal; the daemon treats every non-transient answer as final and moves the completion to `outbox/refused/` (dead letter). Transient failures (network, 408, 429, 5xx) were retried every 30 s forever with a warning each time. | **Fixed for the transient case.** Each waiting completion and each orphan evidence report backs off, doubling up to 15 minutes. Nothing leaves custody for failing. RL-03. |
| Storage grows without bound | Run events are capped at 20000 per run; raw log lines are clipped to 4000 characters, 500 per batch; but a run's total raw log has no cap beyond its timeout. Records are evidence and are never deleted. | **Open (owner decision).** The raw log is the full record behind the event cap, so capping it is an evidence decision, not a bug fix. See risk R-04. |
| `npm_config_*` leaks into user shells | Control Rod has no user terminals, but the inverse exists: `pnpm cr` starts the daemon with pnpm's script environment, and `ChildEnv` removed only `CONTROLROD_*`, so every agent shell got about a dozen `npm_*`/`pnpm_*` variables, including `npm_config_globalconfig`, and the repository's `node_modules/.bin` first on `PATH`. | **Fixed.** `ChildEnv` removes launcher variables and launcher `PATH` entries. RL-04. |
| Experimental feature flags implicated | No equivalent flags. | Not applicable. |

## Protected outcomes

| Protected outcome | Evidence needed |
|---|---|
| A run whose runtime reported success completes as succeeded with its outputs, even if its process lingers. | Fake-runtime run: result line then `sleep 60`, completes succeeded with `out/report.md` well before the timeout; RED without the fix. |
| A failed report, or a non-zero exit of a process that does exit, still fails the run. | Failed-result and `exit 3` tests. |
| Text that only mentions `result` or `turn.completed` never ends a run. | `TestTurnEndReadsOnlyTheRuntimesFinalReport`. |
| Background processes never outlive a finished run. | Background-child test checks the pid is gone. |
| A completion is never dropped for failing to deliver. | Poison-completion test checks the outbox still holds it. |
| Agents do not inherit the launcher's package-manager environment; a user's own settings stay. | `TestChildEnvDropsWhatThePackageManagerLauncherSet`, built from the recorded pnpm environment. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Print mode runs exactly one turn, so the first end-of-turn report is the end of the run. | ADR 0020; `claude -p`, `codex exec`. | ACP sessions or multi-turn runs (ADR 0011) replace print mode. |
| `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` disables background shells and agents. | Read from Claude Code 2.1.318 (`evidence/claude-background-switch.txt`). | A pinned version that drops or renames it; requalify per ADR 0021. |
| The variables pnpm sets are the ones recorded. | `evidence/pnpm-launcher-env.txt` (pnpm 10.28.0). | A pnpm or npm upgrade that adds launcher variables under other names. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).
