# Plan: agent update prompt

1. Add `daemon/internal/agentupdate`: the catalog, the check, version ordering and the registry lookup, with tests.
2. Add `controlrod agents` and `controlrod agents update` with tests for consent, update all, no terminal, and an install outside npm.
3. Run the check once when the daemon starts, behind an opt-out flag and variable.
4. Remove the version guard and the confirmation in turn and record the failing tests (`evidence/mutation.log`).
5. After the owner's yes (2026-11-22): extend `spec/api.tsp` and regenerate; report updates on claims; store and show them in the API and the app shell, with the command to copy (narrowed 2026-11-23: no install from the browser).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-06 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
