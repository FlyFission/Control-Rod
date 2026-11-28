# Risk: Polish and cleanup from the November review (batch 10)

- R-01: the setup code blocks the owner. The code is printed by `pnpm cr start` and the server, and saved in `setup-code` in the Control Rod folder (mode 0600). It is removed once the first passkey exists. Typing it ignores case, spaces and dashes.
- R-02: a lazy page fails to load after an update. The router loads the chunk on navigation; a reload fetches the new build. Board, Inbox and sign-in stay in the main bundle.
- R-03: the agent PATH finds a different CLI than before. Preflight already used that PATH, so detection and the launch now agree.
- R-04: the start wait runs longer. It still ends at two minutes when the log stops growing, and at ten minutes at most.
- R-05: refusing a reason over 2000 characters breaks a caller that sent more. Before, the text was cut without a word; now the person is told the limit.
- Trust surface: none. `spec/` gains optional fields and one query parameter, not a major version. No `.github/`, `kernel/`, `policies/`, `tests/redteam/` or `docs/adr/` file changes.

## Selected mode

- **Mode:** Standard
- Basis: many small, separate fixes; each is reversible by revert.
## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Each finding in batch 10 of the 2026-11-28 review is fixed, already fixed on main, logged with a reason, or covered by another batch. The first passkey needs the setup code the server printed. Web, API and daemon typecheck and the related tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
