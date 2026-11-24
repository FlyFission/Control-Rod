# Plan: control room and the usage-limits module

1. Add the usage-limit models and `GET /usage/limits` to the spec, additive inside API 0.1, and regenerate.
2. API: keep the daemon's latest reading in settings, cleaned to contract fields; serve it to a signed-in person.
3. Daemon: read Codex's newest `rate_limits` snapshot from its session log (at most once a minute) and capture Claude Code's `rate_limit_event` lines from runs it already makes; send both on each claim.
4. Web: a Control room place with movable, collapsible modules (pointer and keyboard), layout kept in local storage; a usage module with reserve gauges, reset countdowns, a pace marker and a worst-first summary; the existing work metrics as a second module.
5. After the owner's decision: the CodexBar engine for the other harnesses, and an ADR recording where usage numbers may come from.
6. Codex blind check, then merge on the owner's yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
