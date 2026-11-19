# Trace: agent runs on macOS and native Linux

| Requirement | Change | Evidence | Disposition |
|---|---|---|---|
| ML-01 Agent runs are offered on macOS and native Linux, and on no other new platform. | `QualifiedPlatform`, `qualify` in `subscriptions.go`. | `TestQualifiedPlatformCoversLinuxAndMacOS`, `TestQualificationMatrix` (E-05) | implemented |
| ML-02 The native Linux launch holds every boundary. | none to the launch; qualification run on `ubuntu-24.04`. | E-01, supported by E-06 | confirmed in CI |
| ML-03 The macOS launch holds every boundary. | none to the launch; qualification run on `macos-15`. | E-02 | confirmed in CI |
| ML-04 A Linux host where bubblewrap cannot sandbox refuses with the fix. | `bubblewrapWorks` in the preflight; AppArmor step in the workflow; Linux setup in `docs/daemon.md`. | E-03 | implemented |
| ML-05 Darwin code is tested on a Mac. | `daemon-macos` job; `checker_darwin_test.go`. | E-04 | see verification |
| ML-06 WSL2 is unchanged. | none to WSL2 paths. | E-05 | confirmed locally and in CI |
| ML-07 The doctor and the docs say where agents run. | `scripts/cr.mjs`, README, docs. | review | implemented |
| Independent signature for the workflow | none | none | open (risk R-05) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

ML-01 to ML-07 are implemented with CI and local evidence reported as it ran; the signature for the new `platforms` workflow is left for a maintainer. Nothing here is presented as signed.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
