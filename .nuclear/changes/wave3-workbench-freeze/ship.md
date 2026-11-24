# Ship: Wave 3/4 workbench views (Explore, Compare, Today), hardened /repos/freeze, and semantic invariants

Release decision: **proposed merge after owner review; branch `feat/wave3-workbench-freeze` committed locally without pushing.**

- **Proposed:** merge `feat/wave3-workbench-freeze` onto `main` after review and CI verification.
- **Not claimed:** full-workspace API test execution beyond the 8 targeted API test files; TypeSpec `spec/api.tsp` specification of `POST /repos/freeze` (deferred so `spec/` remains untouched); Playwright browser E2E, Go daemon, Rust kernel, or Python SDK suites; persistent `/outfall/*` HTTP endpoints (not registered).
- **Owner decisions requested:** review and approve `feat/wave3-workbench-freeze` for merge or request follow-up `spec/api.tsp` addition for `POST /repos/freeze`.

Rollback: revert the merge commit on `main`; no database migrations, `spec/` edits, or stored records are altered.

Monitoring after merge: confirm full CI `typescript` and `change-records` jobs pass, and confirm `POST /repos/freeze` returns `400 invalid-repo-path` for any path outside `workspace_root`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Related prior change: [wave1-hardened-worktrees](../wave1-hardened-worktrees/basis.md).

## Exit criteria

Web typecheck/tests and API typecheck/targeted tests pass after the final edit, `ng.py validate --strict-custody` passes on `.nuclear/changes/wave3-workbench-freeze/`, no trust surface is modified, and the branch holds for owner review.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
