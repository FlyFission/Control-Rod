# Trace: show Claude Code and Codex in the control room from the start

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| CC-01 Claude Code and Codex always have a card; with no reading it says found, signed in and when numbers arrive, with no bar. | `apps/web/src/components/UsageLimits.tsx` (`WaitingGroup`) | `control-room.test.tsx` "shows Claude Code from the start", "says when a built-in harness is missing or signed out", empty state | implemented and tested in jsdom |

No kernel source file, policy, red-team fixture or workflow was edited.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
