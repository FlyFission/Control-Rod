# Plan: Polish and cleanup from the November review (batch 10)

1. Web fixes, with tests where behavior changed (side panel, Inbox badge, sign-in setup code, Records paging, wording).
2. API fixes and the additive spec change; regenerate with `pnpm spec`; tests for the setup code, after-commit hooks, bundled themes, stream ceiling, paging and reason limits.
3. Daemon fixes; `gofmt`, `go vet`, `go test`.
4. CLI and test fixes; `node --test scripts/test/*.test.mjs`.
5. Repo gates. Commit in groups (web, api, daemon, cli and docs, record). Open no pull request; the owner decides.
## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each finding in batch 10 of the 2026-11-28 review is fixed, already fixed on main, logged with a reason, or covered by another batch. The first passkey needs the setup code the server printed. Web, API and daemon typecheck and the related tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
