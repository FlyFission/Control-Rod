# Ship: adapter seam for the run daemon

Release decision: **pull request for owner review; no merge is authorized by this record.**

- **Proposed:** merge [pull request #76](https://github.com/FlyFission/Control-Rod/pull/76) after review. The pull request states that there is no behavior change and points at the golden fixtures and the `sandbox-args` evidence.
- **Not claimed:** a new CLI; a change to sandbox policy, flags, the environment allowlist, or probe commands; that this machine's Codex stand-in (`/bin/true` copied to a `codex` name) is a qualified Codex; qualification of any new host.
- **Owner decisions requested:** approve or return the pull request.

Rollback: revert the merge. No schema, migration, wire field or stored record changes. An older daemon runs against the same control plane.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The registry is the only dispatch for `Detect`, `Command`, `LaunchFor`, `RuntimeFor` and `Probe`. Golden launch output and `sandbox-args` output match the pre-refactor bytes. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
