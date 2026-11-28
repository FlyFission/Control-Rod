# Risk: Pull request state on accepted cards

- R-01: a new recurring outbound read from the API to GitHub, through the same gh sign-in, host and program that already open the pull request. It is read-only, made only when someone views a card with an opened pull request, at most once per pull request per five minutes, and never after it merges or closes.
- R-02: text from GitHub reaching the owner or an agent. Only `state` and the check rollup's status words are requested. They are mapped through fixed lists, and anything unknown counts as still running, never as passing. Nothing else is kept, and nothing reaches an agent.
- R-03: a stale reading mistaken for a fresh one. The pull request line shows when it was checked.
- R-04: a slow GitHub slows the package view. The view waits at most two seconds and then answers without the reading. The read has its own eight-second timeout.
- R-05: the cache is per API process and is lost on restart. The next view reads again.
- Trust surface: `spec/api.tsp` gains optional fields only (not a major version, AGENTS rule 2). `/spec/` is under CODEOWNERS, so the owner's merge-on-green permission is the recorded yes for this additive change.

## Selected mode

- **Mode:** Standard
- Basis: additive contract field, read-only outside call, no data or migration, reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

After Control Rod opens a card's draft pull request, the card's line and the pull request line say whether it is ready to merge, failing its checks, still checking, merged or closed, read live and read-only from GitHub. When GitHub cannot be read, both lines are exactly as before. No text from GitHub is read or shown. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
