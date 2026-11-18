# Ship: Wave 1 hardened worktrees, checkpoints, and host Git isolation

Release decision: **hold for owner `/spec/` CODEOWNERS review, GitHub CI verification, and squash-merge decision on PR #83 (`feat/wave1-hardened-worktrees`); the owner retains the merge decision.**

- **Proposed:** squash-merge PR `#83` (`feat/wave1-hardened-worktrees`) into `main` with DCO `Signed-off-by:` trailers and explicit AI-authorship disclosure, once GitHub CI passes and `@FlyFission` completes independent `/spec/` CODEOWNERS review of `spec/api.tsp` and `spec/generated/openapi/openapi.json`.
- **Not claimed:** that `preserve_patterns` / `copyIgnoredArtifacts()` is supported (removed in Cycle 1 per YAGNI); that `/repos/checkpoint` invokes external Git LFS clean/smudge filters (filters are neutralized transiently so checkpoints record raw working-tree or pointer bytes); that `NewWorkModal` worktree paths or runtime selections are bound into `daemon/internal/runner/workspace.go` (deferred to Cycle 2); that `codex-cli 0.169.0` is qualified (local `TestInstalledCodexLeavesOnlyQualifiedFeatures` fails with 7 newer unqualified features beyond `0.167.0`, unrelated to `#83`); that `cargo-deny`, `go-licenses`, Rust `cargo`, or SBOM checks ran locally (executed in GitHub CI); or that `tools/check_register.py` is clean on pre-existing `kind.ts` and `seals.ts`.
- **Owner decisions requested:** complete independent `/spec/` CODEOWNERS review on PR `#83` (`spec/api.tsp` additive `mode`, `scaffolded_dirs`, `/checkpoint`, and `/remove` contracts) and decide whether to squash-merge PR `#83` to `main`.

Rollback: revert the squash-merge commit on `main`. The `/repos` contract additions (`mode`, `scaffolded_dirs`, `/repos/checkpoint`, `/repos/remove`) and `daemon/internal/runner/git_host.go` helpers add no database migrations, kernel changes, or stored-data alterations; existing `refs/cr-checkpoints/*` git refs in local user clones are non-destructive and can be deleted independently with `git update-ref -d`.

Monitoring after merge: watch `POST /repos/materialize`, `POST /repos/checkpoint`, and `POST /repos/remove` server logs for `git-failed`, `invalid-repo-path`, `unsafe-worktree-path`, or `worktree-dirty` refusals; confirm `docs/third-party/register.md` stays aligned on `git_host.go`; and track Cycle 2 worktree-to-daemon binding (`#84–#86` restack) and `codex-cli 0.169.0` qualification separately.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TypeSpec drift is zero, API (59 files / 726 tests) and Web (45 files / 624 tests, plus 40 office contract build tests) suites pass post-edit, `daemon` `gofmt`/`go vet`/`TestHostGit*`/`confinement`/`digest` pass, Python governance and `ng.py validate --strict-custody` (23 packets) pass, open limits and local `codex-cli 0.169.0` findings are disclosed, and PR `#83` holds for owner `/spec/` CODEOWNERS review and merge.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
