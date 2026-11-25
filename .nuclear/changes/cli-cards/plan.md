# Plan: Add and watch cards from a terminal

1. `server.ts` writes `<home>/cli.token` (0600) at each start, like `daemon.token`; its hash goes in `AuthConfig.cliTokenHash`.
2. `auth.ts`: `CLI_ROUTES` (list projects, packages, captures; GET /repos; POST /repos/materialize; POST /captures), `isCli`, and `cliUser` (the first active member).
3. `app.ts`: the origin check and `person()` accept the token on those routes only; a capture sent with it is recorded with source "cli".
4. `scripts/lib/cards.mjs` and `cr.mjs`: `card add` (same tags, lane and worktree as quick add) and `cards`.
5. Tests: `cli-token.test.ts` (adds and lists, opens nothing else, wrong token refused, daemon token still never a person); `scripts/test/cards.test.mjs`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`controlrod card add` adds a card the way quick add does and `controlrod cards` lists cards by column, with no browser or passkey. The command-line token opens only the listed card routes, acts as the installation's first member, and is refused everywhere else. API, scripts tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
