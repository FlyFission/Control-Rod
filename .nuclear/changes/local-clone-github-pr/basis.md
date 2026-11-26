# Basis: A card on a local clone whose origin is on GitHub gets its pull request

On the owner's Mac on 2026-11-26 at 12:40Z, both sandbox cards (5A574D7A-README-HELLO and 20D3FB1B-README-LINE) were checked by Codex, counted and auto-accepted with no clicks. Neither got a pull request: "Only a GitHub repository gets a pull request". The project was made from the Local clones list, so its repository is the clone name `control-rod-sandbox`, not `FlyFission/control-rod-sandbox`, even though the clone's origin is https://github.com/FlyFission/control-rod-sandbox.git. The New project form lists local clones first, so most projects are made this way.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

When a project's repository is a local clone name, publishCheckout reads the checkout's origin and publishes to that owner/name if it is on github.com; otherwise not-github as before. not-github is retried at server start so cards refused earlier get their pull request. API tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
