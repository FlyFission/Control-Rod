# Risk: Install a new worktree's packages from its lockfile before the author starts

- The install runs on the host, outside the agent's sandbox. Code from the checkout could run there if the package manager ran lifecycle scripts, and an earlier agent round could have written one. Every JavaScript step passes `--ignore-scripts`, uv passes `--no-build` and `--no-install-project`, and the Go and Cargo steps only download. A lockfile that is a link is ignored. The environment is ChildEnv, so the daemon token and API address never reach it.
- The install can be slow or fail. It is bounded at 10 minutes per step, stops with the run, and never fails the run; the run log says what happened.
- Packages that need a build script (native modules) stay unbuilt; tests that need them may still fail, and the notice says so. A person can turn the step off per project.
- No trust surface is touched. The spec change adds an optional field (minor).

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration; the new setting defaults to on and is stored with the other project settings.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Before an author run in a checkout, the daemon installs what the checkout's lockfiles pin (pnpm, bun, npm, uv, Go, Cargo), outside the agent's sandbox, without running any project script, and says what happened in the run log in plain words. A missing tool, a failure or a timeout never fails the run. A project can turn it off with a press, which reaches the daemon as a `setup: off` line in TOOLS.txt. Checkers never trigger it. Go, API and spec tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: the setup-script step of Conductor and Vibe Kanban (ideas only, no code). Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
