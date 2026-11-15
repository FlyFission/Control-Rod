# Plan: adapter seam for the run daemon

1. Capture, before any production edit, the argv, environment and `Launch` value of `Command` and `LaunchFor` for Claude and Codex (author with default tools, explicit model, model `default`, pre-check, intake, and a tools file that names network hosts). Store them in `daemon/internal/runner/testdata/launch-golden/`. Capture `controlrod sandbox-args` for Claude and Codex with the policy fixture from `sandbox_test.go`.
2. Add `daemon/internal/runner/adapter.go` with the `Adapter` registry (`claude`, `codex`, `fake`) and `AdapterFor`.
3. Add `adapter_claude.go`, `adapter_codex.go` and `adapter_fake.go`. Each one calls the existing launch, probe, normalize, turn-end and fake-copy functions. Do not change arguments, flags, settings JSON, environment values, probe commands or error text.
4. Make `Detect`, `Command`, `LaunchFor`, `RuntimeFor` and `Probe` dispatch through the registry. Keep their signatures and the `RuntimeClaude`, `RuntimeCodex` and `RuntimeFake` constants.
5. Move the remaining per-runtime branches in the runner (preflight, host needs, managed Codex config, artifact staging, hook file, Codex permission notice, verified launch, trace version) onto the adapter so the runner no longer switches on runtime names. Behavior of those branches stays the one the existing tests already lock.
6. Add `adapter_test.go`: golden launch, golden stream (`testdata/claude-stream.jsonl` and a Codex stream built from the cases in `events_test.go`), registry completeness, the environment provenance guard, and the unknown-runtime error.
7. Document the registry in one paragraph under Runtimes in `docs/daemon.md`.
8. Re-run `sandbox-args` and diff it against the pre-refactor output. Run `gofmt`, `go vet` and `go test ./...`.

`Capabilities` is descriptive only. Nothing reads it to choose a behavior. Findings about the environment allowlist, if the guard fails, are recorded for a later milestone and the allowlist is not changed here.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The registry is the only dispatch for `Detect`, `Command`, `LaunchFor`, `RuntimeFor` and `Probe`. Golden launch output and `sandbox-args` output match the pre-refactor bytes. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
