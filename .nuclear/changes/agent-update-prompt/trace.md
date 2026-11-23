# Trace: agent update prompt

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| AU-01 Each built-in agent found on PATH is listed with installed and latest version; outdated ones are named at daemon startup. | `agentupdate.Check`, `Summary`; `startupUpdateCheck` | `TestCheckOffersNpmCommandOnlyForNpmInstalls`, `TestCheckOfflineIsQuiet`, `TestNewer`, `TestRegistryLatest` | implemented and tested |
| AU-02 Nothing installs without the person's yes; the command is shown first; update all asks once; the confirmation says to update between runs. | `update` in `agents.go` | `TestUpdateRunsNothingWithoutYes`, `TestUpdateOneAgentByName`, `TestUpdateAllAsksOnceForExactlyTheShownCommands`, `TestUpdateRefusesWithoutTerminalOrYes` | implemented and tested; mutation checked |
| AU-03 Only a strict SemVer version (no build metadata) reaches a command, and only for the copy npm installed globally (`npm root -g`/<package>/). | `StrictVersion`, `npmGlobal` | `TestCheckRefusesAVersionThatCouldCarryArguments`, `TestStrictVersionIsSemVer`, `TestOnlyTheGlobalNpmCopyGetsACommand`, `TestUpdateSkipsAgentWithNoCommand` | implemented and tested; mutation checked |
| AU-04 The check runs at startup or on the person's command only, and can be turned off. | `daemon` in `main.go`, `updateCheckOff`; `Daemon.checkAgentUpdates` | `TestUpdateCheckOff` | implemented and tested |
| AU-05 The daemon reports what its check found on its claims; the control plane stores it, schema-checked, for the app. No route, command or field lets the browser or the control plane install anything or send a command to the daemon. | `services/api/src/agent-updates.ts`; claim and `GET /runtimes` in `app.ts`; `checkAgentUpdates` in `runner/updates.go` | `services/api/test/agent-updates.test.ts`, `TestAgentUpdatesAreReportedNeverRun`, `TestAgentUpdatesReportEmptyOnceCurrent` | implemented and tested |
| AU-06 The app shows each outdated agent with installed and latest version and the exact command to run in a terminal, with a Copy button, and is dismissible per version. It has no install button. | `apps/web/src/components/AgentUpdates.tsx` in `Shell.tsx` | `apps/web/src/components/agent-updates.test.tsx` | implemented and tested (jsdom) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-06 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
