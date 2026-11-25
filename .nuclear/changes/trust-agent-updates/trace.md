# Trace: trust agent updates

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| TU-01 A newer Codex with an unqualified feature stays in work with that feature switched off, only once Codex reports it off; every launch carries its preflight's switches. | `PreflightSwitches` (`adapter_codex.go`, `sandbox.go`), `codexPolicyArgsFor`, `preflightedArtifact` and probe in `daemon.go`, `check.go` | `TestCodexSwitchesOffNewFeaturesInsteadOfRefusing`, `TestCodex0172IsSeatedWithItsNewFeatureSwitchedOff`, `TestCodexLaunchCarriesTheSwitches`, `TestLaunchRefusesSwitchesTheLastPreflightDidNotFind`, existing preflight tests | implemented and tested |
| TU-02 Antigravity and Grok seat the tested build and every newer one, with a note; older or unreadable versions are refused. | `agent_version.go`, `adapter_agy.go`, `adapter_grok.go` | `TestAgyNewerVersionsAreSeated`, `TestGrokVersionLoginAndModels` | implemented and tested |
| TU-03 `controlrod runtimes` and the start log say what was switched off and which versions are newer than tested. | `runtimes_check.go`, `cmd/controlrod/runtimes.go`, `daemon.go` | build; by hand on the owner's Mac | implemented |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TU-01 to TU-03 are implemented and tested, and the daemon tests pass apart from the known cloud-only egress test.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
