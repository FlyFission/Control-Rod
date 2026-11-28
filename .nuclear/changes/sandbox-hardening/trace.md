# Trace: Close the setup escape and harden the sandbox

| Need | Code | Test |
| --- | --- | --- |
| A planted program-naming file stops all of setup (DMN-1) | `setup.go` setupConfigChanges, PrepareCheckout | `setup_test.go` TestPrepareCheckoutRefusesPlantedProgramConfig, TestPrepareCheckoutComparesWithTheCommit |
| No commit to compare with runs nothing | `setup.go` PrepareCheckout | TestPrepareCheckoutWithoutACommitRunsNothing |
| A real pnpm never loads a planted pnpmfile | `setup.go` pnpm flags | TestRealPnpmNeverLoadsAPlantedPnpmfile |
| Secrets are not in setup's environment | `setup.go` SetupEnv | TestSetupEnvKeepsSecretsAndCheckoutProgramsOut, TestRealSetupStepKeepsTheDaemonSecretsOut |
| An agent-planted config never runs across rounds | `daemon.go` call site, `setup.go` | TestAgentPlantedSetupConfigNeverRunsOnTheHost |
| The skip is not keyed on a folder the agent controls (DMN-28) | `setup.go` Done rule | TestPrepareCheckoutNeverInstallsIntoAnExistingFolder |
| A changed lockfile with a Git package is skipped | `setup.go` gitRule | TestPrepareCheckoutRefusesAChangedLockfileWithAGitPackage |
| The baseline is the bound commit | `setup.go` gitBaseline | TestGitBaselineReadsTheBoundCommit |
| The checker root is a private folder (DMN-2) | `private_dir.go`, `checker.go` | `private_dir_unix_test.go` |
| Run folders removed after the outbox, stale ones at start (DMN-9) | `workspace_cleanup.go`, `daemon.go` Handle, Run | `workspace_cleanup_test.go`, `runner_test.go` TestDaemonRunsAFakeJobEndToEnd |
| Agents start in their own session (DMN-21) | `proc_unix.go` | `proc_unix_session_test.go` |
| macOS starts Claude from a verified copy (DMN-17) | `artifact.go` copiesBeforeExec, `adapter_claude.go` | `sandbox_test.go` TestClaudeRunsFromAPrivateCopyOutsideLinux |
| Sign-in refresh hosts allowed (DMN-6) | `daemon.go` harnessSignInHosts | `daemon_egress_test.go` TestAuthorEgressHostsCarryTheSignInRefreshHosts |
| Idle tunnels closed; filter documented (DMN-14) | `egress_proxy.go`, `docs/daemon.md` | `egress_proxy_test.go` TestEgressFilterClosesAnIdleTunnel, TestEgressFilterKeepsABusyTunnelOpen |
| Only https or a site path is a link (WEB-26) | `apps/web/src/lib/links.ts`, CheckerHistory.tsx, PullRequestLine.tsx | `links.test.ts`, `checker-history.test.tsx`, `pull-request-line.test.tsx` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Checkout setup never runs a program named by a file the agent changed or planted, and its environment holds no provider key, token or SSH agent socket. The checker folder in /var/tmp is used only when it is a private folder of this user. Run folders are removed once the completion is in the outbox, and stale ones at start. Agent processes start in their own session. Claude Code on macOS starts from a verified copy. The egress filter allows the sign-in refresh hosts, closes idle tunnels and is documented as defence in depth. Checker evidence and pull request links open only https or this site. gofmt, go vet (Linux and darwin), go test, the web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
