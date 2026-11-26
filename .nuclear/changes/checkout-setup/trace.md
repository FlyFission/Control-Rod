# Trace: Install a new worktree's packages from its lockfile before the author starts

| Need | Code | Test |
| --- | --- | --- |
| Steps follow the lockfiles and never run project scripts | `daemon/internal/runner/setup.go` SetupSteps | `setup_test.go` TestSetupStepsFollowTheLockfilesAndNeverRunProjectScripts, TestSetupStepsIgnoreALockfileThatIsALink |
| Never blocks; plain notices; stops with the run; skips a done install | setup.go PrepareCheckout | TestPrepareCheckoutNeverBlocksAndSaysWhatHappened, TestPrepareCheckoutSkipsAnInstallThatAlreadyRan, TestPrepareCheckoutStopsWithTheRun |
| Daemon secrets stay out | setup.go runSetupStep | TestRealSetupStepKeepsTheDaemonSecretsOut |
| Runs before the author, in the checkout; failure still runs the agent | `daemon.go` execute | `checkout_test.go` TestCheckoutAuthorRunInstallsFromTheLockfileFirst |
| Off switch is a directive, not a tool | runtime.go readTools, setup.go SetupWanted | TestSetupDirectiveTurnsSetupOffAndIsNotATool |
| Project setting is a press and persists | `services/api/src/workspace-projects.ts`, `admin.ts` | `test/admin.test.ts` "turns the install from the lockfile off and on with a press…" |
| The job tells the daemon only when off | `work.ts` buildJob, projectSetupOn | `test/runs.test.ts` "tells the daemon to skip the install…" |
| Contract | `spec/api.tsp` setup | regenerated openapi.json and schema.d.ts |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Before an author run in a checkout, the daemon installs what the checkout's lockfiles pin (pnpm, bun, npm, uv, Go, Cargo), outside the agent's sandbox, without running any project script, and says what happened in the run log in plain words. A missing tool, a failure or a timeout never fails the run. A project can turn it off with a press, which reaches the daemon as a `setup: off` line in TOOLS.txt. Checkers never trigger it. Go, API and spec tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: the setup-script step of Conductor and Vibe Kanban (ideas only, no code). Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
