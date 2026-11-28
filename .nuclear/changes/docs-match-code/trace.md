# Trace: Docs that match the code

| Need | Code or doc | Test or check |
| --- | --- | --- |
| DOC-3 README Linux web workspace says what CI does today | README.md platform table | check_public_claims.py |
| CLI-4 receipt file holds only the receipt; documented flow verifies | scripts/cr.mjs receipt, services/api/src/pr-receipt.ts main, scripts/lib/api-dist.mjs, docs/quickstart-check.md | scripts/test/receipt.test.mjs (fails on main, passes here) |
| DOC-6 status counts from code | docs/status.md | runtimes.ts `runnable` count (6 of 10), apps/web/public/fonts, check_offline_assets.py |
| PKG-1 self-hosted example and fork warning | packages/check-action/README.md, docs/quickstart-check.md | review against action.yml (unchanged) |
| PKG-2 bench status | bench/cross-check/README.md, README.md | `bench.py init` refusal on the real config; 67 offline bench tests |
| DOC-8 daemon runtimes list | docs/daemon.md | adapter registry and ConfinementGap in daemon/internal/runner |
| DOC-9 link output, container note, install flag, Platform Plan pointer | scripts/cr.mjs linkCommand, docs/getting-started.md, docs/auditing.md, AGENTS.md | check_agents_map.py (now under budget) |
| CLI-13 bench --help | scripts/cr.mjs | controlrod-cli.test.mjs "bench --help shows the benchmark's own steps" |
| CLI-16 messages name `pnpm cr` | scripts/lib/update.mjs, scripts/lib/cards.mjs, scripts/cr.mjs | controlrod-cli.test.mjs, cards.test.mjs |
| PKG-3 sha256 on macOS | models/generate.sh, docs/research/outside-perspectives-2026-11/reproduce.sh | reproduce.sh run; shasum branch checked by hand |
| CI-13 response times | SECURITY.md | owner confirmation pending |
| CI-12 workspace listing | pnpm-workspace.yaml, packages/check-action/package.json, pnpm-lock.yaml | `pnpm install --frozen-lockfile`, check-action tests |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The README, status page, daemon, bench, check-action, auditing, getting-started and security docs say only what the code does today, with counts taken from the code. `pnpm cr receipt <proof> --out pr-receipt.md` writes exactly the receipt and the documented receipt-then-verify flow passes through pnpm in a test. `pnpm cr bench --help` prints the bench steps. Messages name `pnpm cr` to people who typed it. The repository gates (public claims, agent map, offline assets) pass, and the scripts, check-action and receipt tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
