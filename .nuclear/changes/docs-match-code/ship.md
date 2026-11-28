# Ship: Docs that match the code

Release decision: **pending**. Merge is the owner's decision.

- Rollback: revert the merge. No data or migration.
- Owner to confirm: the SECURITY.md response-time targets (3 business days to acknowledge, 10 to assess, 30 days to fix or agree a plan, advisory after a fix or at 90 days).
- Monitoring after merge: the first CI run of `pnpm -r run test` now includes the check-action tests and the receipt pipeline test.
- Limits: tests ran on Linux only; the macOS `shasum` branch was checked by running `shasum` on Linux. The README platform line for the Linux web workspace changes again when a CI job starts the app (CI-1).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README, status page, daemon, bench, check-action, auditing, getting-started and security docs say only what the code does today, with counts taken from the code. `pnpm cr receipt <proof> --out pr-receipt.md` writes exactly the receipt and the documented receipt-then-verify flow passes through pnpm in a test. `pnpm cr bench --help` prints the bench steps. Messages name `pnpm cr` to people who typed it. The repository gates (public claims, agent map, offline assets) pass, and the scripts, check-action and receipt tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
