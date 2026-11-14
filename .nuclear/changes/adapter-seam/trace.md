# Trace: adapter seam for the run daemon

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | `Detect`, `Command`, `LaunchFor`, `RuntimeFor` and `Probe` dispatch through the registry. Exported signatures and the runtime name constants stay. | `adapter_test.go` registry and unknown-runtime cases; existing `launch_test.go`, `probe_test.go`, `runner_test.go` | implemented with this change |
| T-02 | Claude and Codex launch argv, environment and `Launch` match the pre-refactor capture for author with default tools, an explicit model, model `default`, pre-check, intake, and a tools file naming network hosts. | `launch_golden_test.go`; fixtures in `testdata/launch-golden/` | implemented with this change |
| T-03 | Claude and Codex stream lines yield the same events and `TurnEnd` results through the adapter and through `Normalize` / `TurnEnd`. | `adapter_test.go`; `testdata/claude-stream.jsonl`; `testdata/codex-stream.jsonl` | implemented with this change |
| T-04 | Every adapter has a non-empty id, binary, roles and output format; ids are unique; order is Claude, Codex, fake; fake is detected only when `CONTROLROD_ALLOW_FAKE=1`. | `adapter_test.go` | implemented with this change |
| T-05 | `AgentEnv` drops the listed provider, proxy and socket variables. A miss is a finding, not an allowlist edit. | `adapter_test.go` | implemented with this change |
| T-06 | An unregistered runtime still returns `runtime %q is not available on this machine`. | `adapter_test.go` | implemented with this change |
| T-07 | `controlrod sandbox-args` for Claude and Codex is byte-identical before and after, using the `sandbox_test.go` policy fixture. | `evidence/sandbox-args-*` | implemented with this change |
| T-08 | No assertion in `launch_test.go`, `sandbox_test.go`, `probe_test.go`, `events_test.go` or `runner_test.go` is edited or deleted. | Review of `git diff` | checked with this change |
| T-09 | The diff against `main` stays inside `daemon/`, `docs/daemon.md` and `.nuclear/changes/adapter-seam/`. | `git diff --stat main` | checked with this change |
| T-10 | Outside the adapter files and the registry, the runner no longer switches on runtime names. | `evidence/switch-scan.txt` | checked with this change |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The registry is the only dispatch for `Detect`, `Command`, `LaunchFor`, `RuntimeFor` and `Probe`. Golden launch output and `sandbox-args` output match the pre-refactor bytes. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
