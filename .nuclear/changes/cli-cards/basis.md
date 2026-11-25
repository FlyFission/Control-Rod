# Basis: Add and watch cards from a terminal

Ben (2026-11-25) asked why he keeps doing steps by hand and how agents can do them. Adding a card today needs the browser, and a person's session needs a passkey. Agents in a terminal on the owner's machine should be able to add a card and watch it move, nothing more.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`controlrod card add` adds a card the way quick add does and `controlrod cards` lists cards by column, with no browser or passkey. The command-line token opens only the listed card routes, acts as the installation's first member, and is refused everywhere else. API, scripts tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
