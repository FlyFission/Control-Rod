# Ship: Hold cards while an agent's usage limit is used up, and start them at the reset

Release decision: **pending**. Merge on green, under the owner's standing merge-on-green permission for this repository, valid to 2026-12-02.

- Rollback: revert the merge. No data or migration.
- Monitoring after merge: when Claude or Codex reports a used-up limit on the owner's Mac, a queued card reads "Held: ... starts on its own when it resets", and it starts after the reset.
- Limits: the reason gives the reset in UTC. Tests use the fake vendor readings the daemon sends, not a real used-up subscription.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A queued author or check run whose agent's last usage reading shows a whole-subscription window used up, with a reset still ahead, waits with a plain reason and the reset time. The Inbox lists it as waiting on the reset, not as something for the person. A run with no agent chosen goes to another offered agent instead. The hold lifts on the first claim after the reset. API typecheck and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
