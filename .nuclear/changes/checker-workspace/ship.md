# Ship: checker workspace for the run daemon

Release decision: **pull request for owner review; no merge is authorized by this record.**

- **Proposed:** merge this pull request after review, and only after pull request #76. This branch is cut from `cursor/adapter-seam-55eb`. The pull request says it depends on #76.
- **Not claimed:** that macOS Seatbelt was executed; that Claude `--safe-mode` works with headless `-p` and the existing OAuth or keychain login; that a real Claude Code or Codex binary was launched; that a prepared checker's `out/criterion-results.json` can be written without voiding the check; that `--max-turns 8` was remeasured for a checker (it is the existing qualification-spike bound).
- **Owner decisions requested:** approve or return the pull request. Decide whether a prepared checker may write criterion results somewhere other than `scratch/verification.json`. Decide whether `--safe-mode` should be added after a headless login check on a machine that has Claude Code.

Rollback: revert the merge. No schema, migration, or kernel change. An older daemon still accepts `out/verification.json` from a fake pre-check. A newer control plane still rebuilds the verification record from `outcome` and `findings`.

Monitoring after merge: a checker that passes after a deliverable byte changes, or an author launch whose argv gains `--disallowedTools` or `--max-turns`, means this change did not stay on the checker path.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

A sandboxed pre-check starts in a clean directory, mounts deliverables read-only, writes only `scratch/verification.json`, and cannot pass when the mount is missing, the hash fails, the schema fails, the tree changes, or anything else is written. Author launch bytes are unchanged. `gofmt`, `go vet` and `go test ./...` in `daemon/` are clean. No protected surface is touched. The owner retains the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
