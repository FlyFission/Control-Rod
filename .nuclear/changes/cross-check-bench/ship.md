# Ship: cross-vendor checking benchmark

Release decision: **pull request for owner review. This record does not authorize a merge or any run.**

- **Proposed:** merge `bench/cross-check/` (harness rebuilt to DESIGN.md v3.3) and the `pnpm cr bench` subcommand, after blind code review by Codex on Astra and Antigravity on Neon.
- **Not claimed:** any result about cross-vendor checking. The fixture numbers come from stub agents.
- **Not claimed:** the real CLI calls, isolation probes against real CLIs, the billing-route check and the SWE-bench grader have not run. Calibration exercises them and stops on any failed probe or control.
- **Owner decisions still open:** the policy values in `configs/verified-historical.json` (calendar horizon, call and token caps, timeouts) before `init`, and the go for calibration.

Rollback: revert the commit. Nothing else reads `bench/`. Study directories are self-contained.

Monitoring after merge: each `share.md` is read against its released `results.json` before posting.


## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`pnpm cr bench` implements DESIGN.md v3.3: a frozen protocol, calibration then sizing then phase 1, isolated single-commit workspaces with isolated sign-in, matched capabilities, the failure taxonomy, grading by test ID with controls, a blind adjudication queue built before evaluation, the frozen statistics, and a release gate. Every step is started by hand and refuses to run out of order. Subscription billing is verified before any call; no API key is used. The offline tests pass with no network and no model calls. Nothing runs on the owner's Mac until the owner says go for calibration.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
