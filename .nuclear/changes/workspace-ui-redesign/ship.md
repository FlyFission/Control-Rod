# Ship: workspace UI redesign and local repository materialization

Release decision: **proposed squash-merge of PR #82 (`feat/workspace-ui-redesign`) after CI and owner `/spec/` CODEOWNERS review; the owner retains the merge decision.**

- **Proposed:** squash-merge PR `#82` (`feat/workspace-ui-redesign`) into `main` with DCO `Signed-off-by:` trailers and explicit AI-authorship disclosure, once CI passes and `@FlyFission` approves `/spec/api.tsp`.
- **Not claimed:** that `NewWorkModal` runtime (`author`/`checker`) or materialized repository paths are bound into `daemon` execution (deferred to Cycle 2); that the 8 disabled CLI ecosystems (`runnable: false`) can run; that `codex-cli 0.169.0` is qualified (local `TestInstalledCodexLeavesOnlyQualifiedFeatures` fails with 7 newer unqualified features beyond `0.167.0`); that Firefox or WebKit ran for `e2e/board-looks.spec.ts` (Chromium only); that `phase3-exit.spec.ts:117` passes (known pre-existing failure); or that `tools/check_register.py` is clean on pre-existing `kind.ts` / `seals.ts`.
- **Owner decisions requested:** review and approve `/spec/api.tsp` under `.github/CODEOWNERS` and decide whether to merge PR `#82` (and whether to qualify `codex-cli 0.169.0` separately).

Rollback: revert the squash-merge commit on `main`. The `Repos` TypeSpec namespace is additive (`/repos`, `/repos/materialize`) with no database migration, kernel change, or stored-data alteration.

Monitoring after merge: watch `GET /repos` and `POST /repos/materialize` logs for `repo-identity-mismatch` or `invalid-workspace-root` refusals in user setups, confirm no Cycle 2 workspace/runtime binding claims appear prematurely in UI copy, and track `codex-cli` version qualification when upgrading beyond `0.167.0`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

TypeSpec drift is zero, API (58 files / 705 tests) and Web (44 files / 619 tests) suites plus Chromium `board-looks.spec.ts` (3/3) pass post-edit, all change records pass `ng.py validate --strict-custody`, open limits and local `codex-cli 0.169.0` findings are disclosed, and the owner holds the merge decision.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
