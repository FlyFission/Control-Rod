# Basis: Install a new worktree's packages from its lockfile before the author starts

On the owner's Mac, card 723F7A44 (issue #206) came back inconclusive: its tests could not run. The fresh worktree had no node_modules, and inside the agent's sandbox (no network) pnpm failed with "Failed to switch pnpm to v10.28.0". Every card in a fresh worktree of a JavaScript, Python, Go or Rust project meets the same wall, so authors and checkers cannot run the project's tests. Tools like Conductor and Vibe Kanban solve this with a setup step that runs in the new worktree before the agent starts. Here the commands come from the lockfile the project already has, so nobody has to write a script.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Before an author run in a checkout, the daemon installs what the checkout's lockfiles pin (pnpm, bun, npm, uv, Go, Cargo), outside the agent's sandbox, without running any project script, and says what happened in the run log in plain words. A missing tool, a failure or a timeout never fails the run. A project can turn it off with a press, which reaches the daemon as a `setup: off` line in TOOLS.txt. Checkers never trigger it. Go, API and spec tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: the setup-script step of Conductor and Vibe Kanban (ideas only, no code). Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
