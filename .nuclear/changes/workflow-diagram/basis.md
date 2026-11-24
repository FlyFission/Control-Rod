# Basis: Show each workflow as a flow diagram

**Change slug:** `workflow-diagram`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-24
**Status:** Built, for owner review.

## Mission / need

The owner, a process engineer, asked on 2026-11-24 for the person's current workflow to be shown as a block flow diagram or a decision matrix on Setup, Settings or the control room, "with excellence", with each agent and each baton pass shown by that agent's own well-known icon.

## What already exists

- Seats, readiness and the check-in answer: `/setup`, `/runtimes`, `/subscriptions`, joined in `apps/web/src/lib/agents.ts` (`agentRows`, `readBack`).
- Who takes which job: `services/api/src/work.ts` `pickRuntime` (planner and author) and `pickChecker` (another runtime than the author's; never falls back to it on its own); send-back up to `MAX_ROUNDS = 3`, then a dispute in the inbox.
- ADR 0024 decisions 2, 6 and 7: blind checker on by default, author-only fall-over logged and flagged, check-in points the person chooses; some stops can never be turned off.

## Proposal

1. `lib/councilFlow.ts`: one pure function from the joined rows and the check-in answer to the council, the flow (steps and edges) and a decision matrix. A stop the person chose but that is not built is "coming soon", never drawn as in force.
2. `lib/councilLayout.ts`: dagre (MIT) ranks the steps; the main line is drawn straight and branches (stand-in author, dispute) sit beside it; left to right on a wide screen, top to bottom on a phone.
3. `components/FlowCanvas.tsx`: React Flow (MIT) draws it, loaded only when a diagram is shown. `WorkflowDiagram` adds the council strip, the flow/matrix switch and the key.
4. Placement: the Setup read-back (updates live as seats and the answer change) and a new place, Control / Setup > Workflow (`/workflow`). The control room (draft PR #171) can mount the same component as a module once it lands.
5. Agent marks: vectors from Lobe Icons (MIT) in `apps/web/public/agent-marks/`, in their owners' colours, with a not-affiliated note. The owner chose real logos on 2026-11-24 after the brand terms were read (Anthropic, OpenAI, xAI and Google ask for permission and no alteration).

## Out of scope

- `spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `tests/redteam/`, `.github/workflows/`: untouched.
- The casting sheet (draft PR #170) and a figure's CLI icon on the Plant (`AgentFigure.runtime`, PR #167): the diagram reads the dispatcher's order today and takes casting-sheet roles when one is in force.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Setup and a new Workflow place draw the person's current workflow as a block flow diagram and as a decision matrix, from the same seats, readiness and check-in answer the dispatcher and Setup read; each agent shows its own mark; nothing unbuilt is drawn as in force; web tests, typecheck, build and the license gate pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
