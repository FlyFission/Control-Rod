# Plan: Docs that match the code

1. Re-check each finding against main 9cd6e04; count ecosystems, adapters and fonts from the code.
2. Receipt: stderr for build output, `--out`, shared locked API build; test the documented pipeline through real pnpm.
3. bench --help, command names in update and card messages, link output.
4. Docs: README (DOC-3 line and the bench lines only), status.md, daemon.md, bench README, check-action README and quickstart-check.md, auditing.md, getting-started.md, AGENTS.md, SECURITY.md.
5. sha256 fallback; workspace listing; check-action package.json; lockfile importer.
6. Gates and tests; change record; owner review. Merge is the owner's decision.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README, status page, daemon, bench, check-action, auditing, getting-started and security docs say only what the code does today, with counts taken from the code. `pnpm cr receipt <proof> --out pr-receipt.md` writes exactly the receipt and the documented receipt-then-verify flow passes through pnpm in a test. `pnpm cr bench --help` prints the bench steps. Messages name `pnpm cr` to people who typed it. The repository gates (public claims, agent map, offline assets) pass, and the scripts, check-action and receipt tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
