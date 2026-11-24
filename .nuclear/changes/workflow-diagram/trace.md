# Trace: Show each workflow as a flow diagram

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| WD-01 The person's workflow is drawn as a block flow diagram. | `councilFlow.ts`, `councilLayout.ts`, `FlowCanvas.tsx` | `councilFlow.test.ts` (flow, layout); screenshots | implemented and tested |
| WD-02 The same workflow reads as a decision matrix. | `WorkflowDiagram.tsx` DecisionMatrix | `workflow-diagram.test.tsx` | implemented and tested |
| WD-03 Author, blind checker, baton pass, author-only stand-in, send-back and dispute follow ADR 0024 and `work.ts`. | `councilFlow.ts` | `councilFlow.test.ts` council and flow cases | implemented and tested |
| WD-04 Check-in points follow the person's answer; unbuilt ones are marked. | `councilFlow.ts` stops | "marks stops the person chose but that are not built as coming" | implemented and tested |
| WD-05 Each agent shows its own mark. | `agentMarks.ts`, `AgentMark.tsx`, `public/agent-marks/` | "has a mark for every built-in agent" | implemented and tested |
| WD-06 Placement on Setup and its own place. | `Setup.tsx`, `Workflow.tsx`, `router.tsx`, `places.ts` | `setup.test.tsx`, `places.test.tsx` | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Setup and a new Workflow place draw the person's current workflow as a block flow diagram and as a decision matrix, from the same seats, readiness and check-in answer the dispatcher and Setup read; each agent shows its own mark; nothing unbuilt is drawn as in force; web tests, typecheck, build and the license gate pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
