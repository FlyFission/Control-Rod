# Basis: Hold cards while an agent's usage limit is used up, and start them at the reset

**Change slug:** `usage-hold`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

When Claude's or Codex's subscription limit was used up, Control Rod still handed it new runs. Each one failed at the vendor and stopped for the person, often overnight. The daemon already reports each agent's usage windows with their reset times on every claim (`usage-limits.ts`, PR #171), but the claim never read them. Seven of the 23 repositories in the 2026-11-28 repo-siphon run do this (humanlayer C-001, paperclip C-001 and others). The design is our own; no donor code is used.

## Proposal

1. `usage-limits.ts` `exhaustedAgents`: from the stored reading, the agents with a whole-subscription window (five_hour, seven_day, primary, secondary, daily, weekly, monthly) that the vendor marks rejected or that reads 100 percent, and whose reset is still ahead. Per-model windows (seven_day_opus, seven_day_sonnet, tertiary) hold nothing. A window without a reset time holds nothing, so a hold can always end.
2. Claim (`work.ts`): a run whose chosen agent is used up is held with cause `usage-limit` and key `usage-limit:<agent>`, and a reason such as "Codex's usage limit is used up. This card starts on its own when it resets, at 17:00 UTC on 2026-11-28." A run with no agent chosen (no card tag, column or project pick) is offered the agents that are not used up first. The hold is released on the first claim after the reset. That is time alone, since the reading is not renewed while no run uses the agent. There is no timer.
3. Inbox: the `usage-limit` cause is waiting on "the agent's usage limit to reset", never on the person.
4. `spec/work.tsp`: `usage-limit` added to `waiting_cause` (additive).

## Out of scope

Intake runs (short, and not held). Switching a seated card to another agent (ADR 0024 fallback, separate). Showing the reset in the viewer's own time zone (the server writes UTC).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A queued author or check run whose agent's last usage reading shows a whole-subscription window used up, with a reset still ahead, waits with a plain reason and the reset time. The Inbox lists it as waiting on the reset, not as something for the person. A run with no agent chosen goes to another offered agent instead. The hold lifts on the first claim after the reset. API typecheck and tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
