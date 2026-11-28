# Basis: work.ts investigation

- **Standard**
- Execution owner: authoring agent under the 2026-11-24 ten-x amendment program.
- Decision owner: Ben Huffer.
- Date: 2026-11-25

## What this rests on

Issue #121 asks for a dependency map and transactional boundaries before any rewrite, then behavior-preserving extraction. The ten-x plan's Phase 5 stops at the follow-up plan. It does not split the file.

`wc -l services/api/src/work.ts` printed 4014. The HTTP routes are in `app.ts`. The kernel calls are the `decide()` sites named in the boundary map. `budgets.ts` already imports `work.ts` while `work.ts` imports `budgets.ts`.

The existing suite already pins the HTTP and kernel paths. The new tests pin the five pure contracts that suite does not name.

## What this does not do

It does not move a function out of `work.ts`. It does not add a kernel action. Executing the extraction plan is a later program.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. The map and the extraction plan exist.
2. `work.ts` is unchanged.
3. The new tests pass.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
