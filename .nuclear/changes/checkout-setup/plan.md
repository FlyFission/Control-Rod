# Plan: Install a new worktree's packages from its lockfile before the author starts

1. Daemon: `setup.go` picks steps from top-level lockfiles (regular files only, not links), skips a step whose folder already exists, runs each with the daemon's secrets removed and a 10-minute limit, and turns every outcome into a plain notice.
2. Hook it in `execute` for checkout author runs only, after the log stream starts and before launch.
3. `setup: off` in TOOLS.txt turns it off; `readTools` never passes it on as a tool.
4. API: a project setting `setup` (a press, like an agent pick); `buildJob` writes `setup: off` for a project that turned it off. Spec field added and regenerated.
5. Tests on both sides. PR, merge on green, update the Mac, rerun the cards.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Before an author run in a checkout, the daemon installs what the checkout's lockfiles pin (pnpm, bun, npm, uv, Go, Cargo), outside the agent's sandbox, without running any project script, and says what happened in the run log in plain words. A missing tool, a failure or a timeout never fails the run. A project can turn it off with a press, which reaches the daemon as a `setup: off` line in TOOLS.txt. Checkers never trigger it. Go, API and spec tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: the setup-script step of Conductor and Vibe Kanban (ideas only, no code). Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
