# Active run switcher

**Change slug:** `active-run-switcher`
**Date:** 2026-11-21

Provide direct navigation among recorded active runs from the desktop workspace. The package already has run history and the agent panel already reads an individual transcript. Reuse those views and the existing active runs contract.

## Owner decisions

| # | Decision | Owner's words | Given | Reading | Out of scope |
| --- | --- | --- | --- | --- | --- |
| D1 | Optimize for developers switching sessions | "I usually keep several terminals up which is nice" | 2026-11-21, chat | Make each active run directly reachable while preserving the package context. | New provider launch support or interactive terminal control. |
| D2 | Add a shell run switcher | none: authoring agent's choice, open to the owner | 2026-11-21, chat | Reuse recorded run IDs and confirm the caller's organization before returning active runs. | Run lifecycle changes. |

## Required links

[risk](risk.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Demonstrate correct run scope and exact attempt navigation. Record the local test results for the owner.

## Source-lineage note

Local change evidence. Inspiration from the pinned workbench donor review and Multica public documentation. [Workflow source map](https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md).
