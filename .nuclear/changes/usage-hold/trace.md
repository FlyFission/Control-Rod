# Trace: Hold cards while an agent's usage limit is used up, and start them at the reset

| Need | Code | Test |
| --- | --- | --- |
| Used-up seated agent holds the run with reason and reset | `work.ts` claim, `usage-limits.ts` exhaustedAgents | `runs.test.ts` "holds a card whose only agent has used up its limit..." |
| Inbox waits on the reset, not the person | `inbox.ts` holdResolver | same |
| Hold lifts once the reset has passed | `work.ts` releaseHold usage-limit | same |
| A run with no seat goes to another agent | `work.ts` spare | "gives a card with no agent chosen to another agent..." |
| A per-model window holds nothing; a vendor "allowed" outranks a full percent | `usage-limits.ts` exhaustedAgents | same |
| A blind check waits for a spent independent agent, never moved to the author's | `work.ts` spareOf | "holds a blind check for a spent independent agent..." |
| Intake goes to an agent not used up, or waits | `work.ts` claim intake | code review (blind reviewer finding 3) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A queued author or check run whose agent's last usage reading shows a whole-subscription window used up, with a reset still ahead, waits with a plain reason and the reset time. The Inbox lists it as waiting on the reset, not as something for the person. A run with no agent chosen goes to another offered agent instead. The hold lifts on the first claim after the reset. API typecheck and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
