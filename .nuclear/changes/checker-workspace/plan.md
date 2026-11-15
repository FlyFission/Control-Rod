# Plan: checker workspace for the run daemon

1. For a sandboxed pre-check only, build a clean working directory. Put Control Rod's brief and criteria in `inputs/`. Put deliverables in a sibling tree (on macOS, in `inputs/deliverables/`). Prepend a notice that those files are data, not instructions. The fake runtime keeps `Prepare`.
2. On Linux and WSL2, start the checker under bubblewrap: `--bind / /`, `--ro-bind` the deliverable tree onto `inputs/deliverables/`, and `--ro-bind-fd` of the verified executable back onto its own path. On macOS, generate a Seatbelt profile that allows the default and denies `file-write*` on that path. Any other platform, or a missing `bwrap` or `sandbox-exec`, fails the check before a process starts.
3. Add checker flags without editing author argv. Claude: `--disallowedTools mcp__*,Agent` and `--max-turns` taken from the qualification spike. No `--fallback-model`. No `--safe-mode`. Codex already passes `--ignore-user-config`, `--ephemeral` and `--disable multi_agent`; the checker uses that same list and a checker prompt.
4. Hash the deliverable tree before and after (SHA-256 over sorted relative paths, kind, full mode, and payload; symlink targets are not read). Snapshot the working directory. `scratch/verification.json` is the only allowed change.
5. Validate that file. A full record must match `VerificationRecord.json`. A short file must be `outcome` (`pass`, `fail`, or `inconclusive`), `findings` (each a `Finding`), and optional `evidence`. Move a valid file onto the completion. A void, a schema failure, a hash failure, or a missing mount fails the completion, records a policy notice, and attaches no verification. `wrote_files` is that failure text. It is not added to the verification schema or the kernel.
6. Tests: injected instruction files and a `.claude` hook are absent from discovery and the hook does not run; argv carries the flags; a write outside scratch or into the deliverable tree voids; a mismatched hash voids; invalid JSON is refused; bubblewrap refuses a write; `Confirm` does not treat bubblewrap as the runtime; author goldens stay byte-identical.
7. Point the pre-check role at `scratch/verification.json` and document the workspace in `docs/daemon.md`.
8. Run `gofmt -l .`, `go vet ./...` (linux, darwin, windows) and `go test -count=1 ./...` in `daemon/`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A sandboxed pre-check starts in a clean directory, mounts deliverables read-only, writes only `scratch/verification.json`, and cannot pass when the mount is missing, the hash fails, the schema fails, the tree changes, or anything else is written. Author launch bytes are unchanged. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
