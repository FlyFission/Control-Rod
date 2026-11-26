# Ship: Install a new worktree's packages from its lockfile before the author starts

Release decision: **approved by the owner.**

## Signature

Owner (sole maintainer): Ben Huffer, standing yes in the project thread on 2026-11-25 at 23:13 UTC: "You have my permission to merge anything on this repo when it's green", for seven days. The default (install on, with a per-project off switch) was the coordinator's call on the owner's instruction to stop asking him routine questions. No trust surface is touched.

- Rollback: revert the merge. The stored setting is ignored by older code.
- Monitoring after merge: after the next `controlrod update`, a card's run log starts with a "Setup:" line and its tests can run.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Before an author run in a checkout, the daemon installs what the checkout's lockfiles pin (pnpm, bun, npm, uv, Go, Cargo), outside the agent's sandbox, without running any project script, and says what happened in the run log in plain words. A missing tool, a failure or a timeout never fails the run. A project can turn it off with a press, which reaches the daemon as a `setup: off` line in TOOLS.txt. Checkers never trigger it. Go, API and spec tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: the setup-script step of Conductor and Vibe Kanban (ideas only, no code). Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
