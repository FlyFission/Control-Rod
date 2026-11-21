# Basis: agent panel (click-to-talk slice S1)

**Change slug:** `agent-panel`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether the branch `claude/project-thread-j4bu3j` is merged as slice S1 of the click-to-talk design.

## Mission / need

The owner keeps several agent terminals open at once and wants one place that shows what each agent is doing. Clicking an agent on the board or in the office should open a terminal-style view of that agent. Slice S1 is the read-only half: one agent panel, opened from the board's review drawer and the office's agent card, showing the run's recorded events as a live transcript with Stop. Talking to an agent (Exploration sessions, the ACP client, custom agents) comes in later slices with their own change records.

## Scope

In scope: `apps/web` only (see risk.md) and this packet. Out of scope: any API, spec, daemon, kernel, policy, red-team or workflow change; any way to send text to a running agent.

## Fixed inputs

Board design K1 (no steering of a running card; a Return reason goes to the next run) and ADR 0020 (print-mode runs take one prompt). The panel's wording follows both.

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| `GET /packages/:id/runs/:runId/events` returns the run's normalized events in order. | `api/client.ts` `runEvents`; the case page already reads it. | A change to the events route or the NormalizedEvent shape. |
| The newest live run is the agent a board card should show. | `PackageView.runs` carries every run with its status. | A package with two live runs at once (the `runs_one_live` constraint forbids it per revision and role). |
| A Return decision's reason reaches the next run. | `services/api/src/work.ts` adds it to the next brief as direction from the owner. | That injection is removed. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Slice S1 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the agent panel open, and the owner has made the merge decision. Nothing here claims that any agent can be talked to: controlled runs stay one prompt (ADR 0020), and the panel says so. No session, message channel or Exploration is added.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
