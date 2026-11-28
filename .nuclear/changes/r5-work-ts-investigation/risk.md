# Risk: work.ts investigation

- **Mode:** Standard
- Execution owner: authoring agent under the 2026-11-24 ten-x amendment program, Phase 5.
- Decision owner: Ben Huffer. No trust surface is edited. `work.ts` is not split in this change.
- Scope: characterization tests for the unpinned pure contracts, the boundary map, the follow-up extraction plan, and this record.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | This change splits `work.ts` or adds a kernel action. | The diff does not modify `services/api/src/work.ts` or `kernel/`. | Any edit under `kernel/` or to `work.ts`. |
| R-02 | The follow-up plan names a module the map does not justify, or leaves the budgets cycle in place. | The plan's first task breaks `budgets.ts` importing `work.ts`. Later tasks import `queueRun` from a leaf. | A task that has two of the four services import each other. |
| R-03 | The new tests pin a behavior the code does not have. | They recompute the challenge bytes and the draft digest from the same functions the code uses, and they passed. | A test that expects a string the function does not return. |

## Selected mode

- **Mode:** Standard
- Basis: an investigation and a plan. No behavior change in `work.ts`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

1. The boundary map names the four services, the `queueRun` leaf, and every `decide()` site.
2. The extraction plan stops. It is not executed here.
3. The new characterization tests pass, and `work.ts` is unchanged.

## Source-lineage note

Local engineering evidence under the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md
