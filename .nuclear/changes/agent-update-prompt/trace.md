# Trace: agent update prompt

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| AU-01 Each built-in agent found on PATH is listed with installed and latest version; outdated ones are named at daemon startup. | `agentupdate.Check`, `Summary`; `startupUpdateCheck` | `TestCheckOffersNpmCommandOnlyForNpmInstalls`, `TestCheckOfflineIsQuiet`, `TestNewer`, `TestRegistryLatest` | implemented and tested |
| AU-02 Nothing installs without the person's yes; the command is shown first; update all asks once; nothing installs locally while a daemon holds its home. | `update` in `agents.go` | `TestUpdateRunsNothingWithoutYes`, `TestUpdateOneAgentByName`, `TestUpdateAllAsksOnceForExactlyTheShownCommands`, `TestUpdateRefusesWithoutTerminalOrYes`, `TestUpdateRunsNothingWhileADaemonHoldsItsHome` | implemented and tested; mutation checked |
| AU-03 Only a strict SemVer version (no build metadata) reaches a command, and only for the copy npm installed globally (`npm root -g`/<package>/). | `StrictVersion`, `npmGlobal` | `TestCheckRefusesAVersionThatCouldCarryArguments`, `TestStrictVersionIsSemVer`, `TestOnlyTheGlobalNpmCopyGetsACommand`, `TestUpdateSkipsAgentWithNoCommand` | implemented and tested; mutation checked |
| AU-04 The check runs at startup or on the person's command only, and can be turned off. | `daemon` in `main.go`, `updateCheckOff`; `Daemon.checkAgentUpdates` | `TestUpdateCheckOff` | implemented and tested |
| AU-08 Codex 0.171.0 passes the feature preflight; any other unqualified feature is still refused. | `CodexSafeFeatures` in `sandbox.go` | `TestCodex0171FeaturesAreQualified` (captured list), existing preflight tests | implemented and tested; failed first |
| AU-09 `pnpm cr doctor` reports each agent as the daemon will find it. | `CheckRuntimes` (`runner/check.go`), `controlrod runtimes`, `agentChecks` in `scripts/cr.mjs` | manual run (verification E-06) | implemented, checked by hand |
| AU-05 An administrator's signed request names each agent and the version shown; it reaches the daemon as names and versions only, once; an agent with no command or no reported update, or whose reported version changed, is refused; a request the daemon no longer needs, or for another version, is dropped; report, request and take hold one lock; a request is exactly `{ agent, version }`. | `services/api/src/agent-updates.ts`; `runtime.update` in `admin.ts`; routes in `app.ts` | `services/api/test/agent-updates.test.ts` | implemented and tested; mutation checked |
| AU-06 The daemon runs only its own command, only for the version requested and only if it is still newer than the installed one (checked again just before), only while no job is claimed or active, no receipt remains and no run whose stop was unconfirmed may still have processes; then probes and re-checks only the runtimes whose command ran. | `daemon/internal/runner/updates.go` (`updateIdle`, `holdIfUnconfirmed`, `noteUncontained`, `startJob`), `probeSome` in `daemon.go` | `TestAgentUpdateRunsOnlyTheDaemonsOwnCommandWhenAsked`, `TestAgentUpdateWaitsWhileARunIsActive`, `TestAgentUpdateWaitsForAClaimedJobNotYetActive`, `TestAgentUpdateWaitsWhileAReceiptRemains`, `TestAgentUpdateWaitsForAnUnconfirmedStopWithoutAReceipt`, `TestAgentUpdateWaitsForARestartAfterAnUnknownStop`, `TestAgentUpdateNeverDowngrades`, `TestAgentUpdateProbesOnlyWhatItRan` | implemented and tested; mutation checked |
| AU-07 The app shows each outdated agent with the exact command, Update and Update all as signed requests, disabled with the reason without authority, and dismissible per version. | `apps/web/src/components/AgentUpdates.tsx` in `Shell.tsx` | `apps/web/src/components/agent-updates.test.tsx` | implemented and tested (jsdom) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-09 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
