# Basis: agent map check and port provenance

**Change slug:** `agents-map-provenance`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-16
**Decision this basis supports:** whether to accept two small checks from the Plannotator pattern note (`docs/patterns/plannotator.md`): PL6, a size and reference check for the root agent guide, and PL7, a provenance file for every port of code.

## Mission / need

AGENTS rule 6 asks for lean context. Nothing stops `AGENTS.md` from growing, or from naming a path that no longer exists. The borrowed-code register pins each ported file, but it does not record what was removed or changed on the way in, which tests came with it, or how the port behaves differently from upstream. Ports are planned (openharness H1 to H9).

## Scope

In scope: `tools/check_agents_map.py` and its test, the recorded budget `tools/agents_map_budget.json`, a provenance rule in `tools/check_register.py` and its test, `docs/third-party/port-provenance.md`, a rule line in `docs/third-party/register.md`, a row in `docs/getting-started.md`, and the PL6 and PL7 rows of the pattern note. Out of scope: CI wiring (`.github/workflows/` is a trust surface), `AGENTS.md` itself, and any port.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Start PL6 and PL7. | "start PL6 and PL7" | 2026-11-16, Claude Code session for this pull request | Build the agent map check and the port provenance rule, with tests and docs. | CI wiring (a workflow change); choosing headroom for the budget. |
| D2 | Close out the pull request: settle the open decisions by the agent's best judgement and merge. | "You have my permission to close all of these out in the objectively best way possible continue" | 2026-11-21, Claude project thread "Close out the open review decisions", in reply to a list of the open decisions on #88, #92 and #102 with a recommendation for each | The agent settles each open decision in this record by the recommendation it gave, records each as its own choice, and merges once CI is green. | Confirming words the owner gave in earlier sessions; a person's read of the note for copied wording; any new trust-surface change; building any item. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The budget is the measured size of `AGENTS.md` at the time of recording, so the guide cannot grow without a reviewed change to the budget file. | `--record` writes the size and SHA-256 (AGENTS rule 5). | The owner wants headroom; then they choose it and re-record. |
| Backticked tokens that contain `/` or end in `.md` are repository paths. | All such tokens in `AGENTS.md` and `CLAUDE.md` resolve today. | A guide uses a backticked path-like token that is not a path; the check then needs an exception. |
| No register row is a code file today, so the new rule breaks no existing row. | `docs/third-party/register.md` lists font files only. | A code row lands before this change merges. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`tools/check_agents_map.py` passes on this branch with a recorded budget, `tools/check_register.py` requires a provenance file for every ported code file, both have passing tests, and the owner has reviewed the change.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
