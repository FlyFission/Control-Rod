# Plan: Hold cards while an agent's usage limit is used up, and start them at the reset

1. `exhaustedAgents` and `usageHoldReason` in usage-limits.ts.
2. Claim: spare used-up agents when nothing is seated; hold a seated run; release on reset.
3. Inbox resolver for `usage-limit`; spec enum value; regenerate.
4. Tests in `test/runs.test.ts`: hold with reason and inbox routing, then release after the reset; a run with no seat goes to another agent; a per-model window holds nothing.
5. Typecheck, related suites, PR, blind review (at most two rounds), merge on green under the owner's merge-on-green permission (to 2026-12-02).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A queued author or check run whose agent's last usage reading shows a whole-subscription window used up, with a reset still ahead, waits with a plain reason and the reset time. The Inbox lists it as waiting on the reset, not as something for the person. A run with no agent chosen goes to another offered agent instead. The hold lifts on the first claim after the reset. API typecheck and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
