# Plan: Show each workflow as a flow diagram

1. Read ADR 0024, `work.ts` dispatch, Setup and the open PRs that touch the same pages (#167, #170, #171).
2. Read the vendors' brand terms; ask the owner whether to ship real logos.
3. Model (`councilFlow.ts`), layout (`councilLayout.ts`), canvas (`FlowCanvas.tsx`), wrapper and matrix (`WorkflowDiagram.tsx`), marks (`agentMarks.ts`, `AgentMark.tsx`).
4. Mount on Setup and at `/workflow`; add the place to the nav.
5. Unit and component tests, screenshots at 1440 and 390, draft PR, blind check by another vendor.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Setup and a new Workflow place draw the person's current workflow as a block flow diagram and as a decision matrix, from the same seats, readiness and check-in answer the dispatcher and Setup read; each agent shows its own mark; nothing unbuilt is drawn as in force; web tests, typecheck, build and the license gate pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
