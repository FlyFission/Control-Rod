# Risk: Docs that match the code

- R-01: `receipt` output changes stream. Failures now go to standard error, and the receipt alone to standard output. Anyone who captured a failure line from standard output sees it on standard error instead. Exit codes are unchanged.
- R-02: the shared API build lock. A lock left by a killed build is taken over after 10 minutes; a waiter gives up after 15 with a plain message. The lock lives in node_modules, outside git.
- R-03: `packages/*` in the workspace makes `pnpm -r run test` run the check-action tests in CI, which build the API first. If they fail in CI, that is a real failure the repository never saw before; nothing is skipped.
- R-04: SECURITY.md response times are a default chosen by the implementing agent. They are labelled as targets the owner may change, and need the owner's confirmation.
- R-05: wording drift. Every changed sentence was checked against the code it describes; the README line for the Linux web workspace is written so the CI-1 change can replace it in one edit.
- Trust surface: none. No file under `.github/`, `policies/`, `tests/redteam/`, `spec/`, `kernel/` or `docs/adr/` changes. packages/check-action/action.yml is unchanged.

## Selected mode

- **Mode:** Standard
- Basis: docs and CLI messages, one CLI option, a build helper and a workspace listing; reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README, status page, daemon, bench, check-action, auditing, getting-started and security docs say only what the code does today, with counts taken from the code. `pnpm cr receipt <proof> --out pr-receipt.md` writes exactly the receipt and the documented receipt-then-verify flow passes through pnpm in a test. `pnpm cr bench --help` prints the bench steps. Messages name `pnpm cr` to people who typed it. The repository gates (public claims, agent map, offline assets) pass, and the scripts, check-action and receipt tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
