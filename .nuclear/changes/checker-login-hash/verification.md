# Verification: Let Codex checks run on a default Mac install

| Evidence ID | Status | Claim and limit | Artifact |
|---|---|---|---|
| E-01 | pass | `go test ./...` in the daemon with bubblewrap installed: every test passes, including the Linux checker-sandbox login tests (`TestCheckerCannotRewriteLoginInstructions`, `TestCheckerMountKeepsTheLoginDirectoryReadOnly...`), except `TestAuthorEgressFilterStartsAndInjectsProxyEnvDuringRun`, which fails the same way on main because this cloud container sets its own HTTPS_PROXY. `go vet` for darwin/arm64, build for windows, gofmt clean. macOS Seatbelt tests are not run here. | `evidence/go-test.log` |
| E-02 | pass | `TestRunRefusedBeforeStartReportsNoProcess` fails with the daemon fix reverted and passes with it. | `evidence/go-test.log` |
| E-03 | pending | Codex blind review on the owner's Mac. | PR thread |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A Codex check on a default macOS install (the Codex app keeps its own CLI binary under `~/.codex/plugins/`) hashes the login directory and runs; a run refused before its process starts is recorded as failed with its reason and can be requeued, never held as outcome unknown; daemon tests pass apart from the sandbox tests this container cannot run.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
