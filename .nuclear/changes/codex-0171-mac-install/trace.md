# Trace: first macOS install fixes

| Requirement | Code | Tests | Disposition |
|---|---|---|---|
| MI-01 Codex 0.171.0 passes the feature preflight; any other unqualified feature is still refused. | `CodexSafeFeatures` in `sandbox.go` | `TestCodex0171FeaturesAreQualified` (captured list), existing preflight tests | implemented and tested; failed first |
| MI-02 `pnpm cr doctor` reports each agent as the daemon will find it. | `CheckRuntimes` (`runner/check.go`), `controlrod runtimes`, `agentChecks` in `scripts/cr.mjs` | manual run (verification E-02) | implemented, checked by hand |
| MI-03 The start log names awaiting agents once and does not warn about macOS containment. | `probe`, `Run` in `daemon.go` | existing runner tests | implemented, checked by hand |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

MI-01 to MI-03 are implemented; MI-01 fails first on the captured Codex 0.171.0 feature list, and the daemon tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
