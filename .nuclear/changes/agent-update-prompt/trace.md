# Trace: agent update prompt

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| AU-01 Each built-in agent found on PATH is listed with installed and latest version; outdated ones are named at daemon startup. | `agentupdate.Check`, `Summary`; `startupUpdateCheck` | `TestCheckOffersNpmCommandOnlyForNpmInstalls`, `TestCheckOfflineIsQuiet`, `TestNewer`, `TestRegistryLatest` | implemented and tested |
| AU-02 Nothing installs without the person's yes; the command is shown first; update all asks once. | `update` in `agents.go` | `TestUpdateRunsNothingWithoutYes`, `TestUpdateOneAgentByName`, `TestUpdateAllAsksOnceForExactlyTheShownCommands`, `TestUpdateRefusesWithoutTerminalOrYes` | implemented and tested; mutation checked |
| AU-03 Only a strict version reaches a command, and only for an npm install of the named package. | `strictVersion`, `npmInstalled` | `TestCheckRefusesAVersionThatCouldCarryArguments`, `TestUpdateSkipsAgentWithNoCommand` | implemented and tested; mutation checked |
| AU-04 The check runs at startup or on the person's command only, and can be turned off. | `daemon` in `main.go`, `updateCheckOff` | `TestUpdateCheckOff` | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

AU-01 to AU-04 are implemented with failed-first (mutation) evidence, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
