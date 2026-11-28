# Trace: Hold cards while an agent's usage limit is used up, and start them at the reset

| Need | Code | Test |
| --- | --- | --- |
| Used-up seated agent holds the run with reason and reset | `work.ts` claim, `usage-limits.ts` exhaustedAgents | `runs.test.ts` "holds a card whose only agent has used up its limit..." |
| Inbox waits on the reset, not the person | `inbox.ts` holdResolver | same |
| Hold lifts once the reset has passed | `work.ts` releaseHold usage-limit | same |
| A run with no seat goes to another agent | `work.ts` spare | "gives a card with no agent chosen to another agent..." |
| A per-model window holds nothing | `usage-limits.ts` WHOLE_WINDOWS | same |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A queued author or check run whose agent's last usage reading shows a whole-subscription window used up, with a reset still ahead, waits with a plain reason and the reset time. The Inbox lists it as waiting on the reset, not as something for the person. A run with no agent chosen goes to another offered agent instead. The hold lifts on the first claim after the reset. API typecheck and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
