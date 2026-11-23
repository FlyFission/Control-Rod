# Plan: First-run setup and the Agents roster

1. Diagnose the failed card on the owner's machine, read-only. Fix the intake brief with a drift test.
2. Add the setup contract to spec/api.tsp and regenerate (`pnpm spec`).
3. API: `services/api/src/setup.ts`, routes, catalog command, refusal text, claim filter, regenerated command inventory.
4. Web: `lib/agents.ts` (joined rows, plain status, read-back), `AgentList`, Setup page, Agents roster, first-run redirect, Snapshots, nav.
5. Tests, screenshots from the running app, draft PR, blind check by another vendor.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A first run opens on Setup; the person confirms seats and one check-in answer before anything is saved; the Agents roster shows one switch per runnable agent and says in plain words why an agent cannot work, from the same probes as Provider CLIs; a benched agent is never offered work; the intake brief names every field the WorkPackage contract requires. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
