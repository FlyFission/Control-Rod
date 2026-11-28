# Basis: Docs that match the code

**Change slug:** `docs-match-code`
**Owner:** Ben Huffer
**Date:** 2026-11-28
**Status:** Built, for owner review.

## Mission / need

The 2026-11-28 review (batch 9 and part of batch 10) found docs that say more than the code does, and a documented command that fails. DOC-3: the README says the Linux web workspace has "Scripted CI", but no workflow starts the app. CLI-4: `pnpm cr receipt proof.json > pr-receipt.md` also captures pnpm's own banner line, and `pnpm cr verify --receipt` rejects any extra line (confirmed: the documented pair exits 1). DOC-6: docs/status.md counts the disabled agent CLIs wrong and says fonts are fetched; the code disables 6 of 10 and bundles the fonts. PKG-1: the check-action example uses `ubuntu-latest`, which has no signed-in checker CLI, and says nothing about forks. PKG-2: the bench reads as runnable, but its real config refuses `init` until the owner pins the dataset. DOC-8: docs/daemon.md lists only claude, codex and fake. DOC-9: the link output offers a `--background` flag that `controlrod start` already uses, the container note claims something nobody can check, auditing.md installs without `--frozen-lockfile`, and AGENTS.md says the Platform Plan is linked when it is owner-held (AGENTS.md was also over its byte budget). CLI-13: `pnpm cr bench --help` printed nothing. CLI-16: CLI messages say `controlrod` to people who typed `pnpm cr`. PKG-3: two scripts call `sha256sum`, which macOS lacks. CI-13: SECURITY.md gives no response times. CI-12: the pnpm workspace lists a missing `sdk/ts` and leaves out `packages/`, so the check-action tests never ran.

## Proposal

1. Reword each doc line to what the code does now, with counts read from the code (`runnable` in apps/web/src/lib/runtimes.ts, the adapter registry in daemon/internal/runner/adapter.go).
2. `pnpm cr receipt`: build output to standard error, an `--out <file>` option that writes only the receipt, failures to standard error; docs use `--out`. A shared, locked build step (scripts/lib/api-dist.mjs) so two commands or tests that need the built API never build it at once.
3. `bench --help` goes to bench.py. update and card messages take the command name the person typed.
4. A `shasum -a 256` fallback in the two scripts. Response-time targets in SECURITY.md, marked as targets the owner sets.
5. Workspace: drop `sdk/ts`, add `packages/*`, and give packages/check-action a package.json whose test builds the API and runs action.test.mjs. The Action itself (action.yml) is unchanged.

## Out of scope

A CI job that starts the app (CI-1, another worker). Changing any license allowlist (reported only). The stale docs/commands/inventory.md (fails on main too). README install steps, signing lines and screenshot captions (other workers).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README, status page, daemon, bench, check-action, auditing, getting-started and security docs say only what the code does today, with counts taken from the code. `pnpm cr receipt <proof> --out pr-receipt.md` writes exactly the receipt and the documented receipt-then-verify flow passes through pnpm in a test. `pnpm cr bench --help` prints the bench steps. Messages name `pnpm cr` to people who typed it. The repository gates (public claims, agent map, offline assets) pass, and the scripts, check-action and receipt tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
