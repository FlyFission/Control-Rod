# Trace: Antigravity CLI as a confined seat

| Requirement | Change | Tests and checks | Disposition |
|---|---|---|---|
| AG-01 Antigravity runs author (outside a checkout), intake and pre-check work on macOS. | `adapter_agy.go` launch, `adapter.go` confinement seam, `checker.go` run root | `adapter_agy_test.go` argument shape; qualification `positive` | implemented and tested |
| AG-02 Commands cannot read logins, reach the network or write outside the workspace. | print-mode terminal sandbox; command denies | qualification `cat-home`, `network`, `touch-outside` | implemented, live check |
| AG-03 File tools stay inside the workspace. | `AgySettings`, `agyOutsideDenies`, run root outside home | unit fence tests; qualification `view-home`, `view-peer`, `write-outside` | implemented, live check |
| AG-04 User configuration and hook files never reach a run. | per-run home (`PrepareRunHome`); refusal near `.agents`, `GEMINI.md`, `AGENTS.md` | `TestAgyRefusesWorkspaceConfigurationItWouldLoad`; run-home tests | implemented and tested |
| AG-05 Tools that act outside the sandbox are refused. | global PreToolUse gate in the run home | gate tests; qualification `web-search`, `subagent` | implemented, live check |
| AG-06 A checker cannot change what it checks. | plan mode, scratch-only writes, write commands denied, tree hash | checker settings tests; qualification `checker` | implemented, live check |
| AG-07 Only Gemini models count. | `models.json` agy entries | API `wave2-assurance.test.ts` | implemented and tested |
| AG-08 Refused and failed runs read as failures. | `parseAgy`, `agyResult.failed` | `TestAgyCapturedStream` on captured lines | implemented and tested |
| AG-09 Checkout authors and other platforms stay refused. | `AgyArgs`, `ConfinementGap`; API `CHECKOUT_AUTHORS` | refusal unit tests; API seat tests | implemented and tested |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Sandbox decision: [ADR 0021](../../../docs/adr/0021-native-cli-sandboxes.md). Seats: [ADR 0024](../../../docs/adr/0024-council-first.md).

## Exit criteria

Antigravity CLI runs author (outside a checkout), intake and pre-check work on macOS under its own terminal sandbox, with file-tool rules, a per-run home and plan-mode checks that Control Rod derives from the run's policy; it stays refused on every other platform and for checkout authoring; its pre-checks count with the Gemini models registered for it; the live qualification passes on a Mac; and the owner has made the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
