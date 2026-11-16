# Phase 1: two workbench links missing from migration 010 (threads on PR #17)

Codex connector threads on `services/api/src/db/migrations/010-workbench.ts`, still open after merge. Checked against `main` at `d25deae` on 2026-11-06. Migration 010 is checksum locked, so the fix is a new migration, `019-workbench-links`.

| Thread | Decision | Change and evidence |
|---|---|---|
| 4428161936: bind a checkpoint's workspace to its exploration (P2) | Accepted, fixed | Confirmed: the checkpoint's two foreign keys checked existence and organization separately, so a checkpoint could name exploration A with exploration B's worktree, or a run's workspace. `workspaces` gains a unique key on `(id, exploration_id, org_id)` and `checkpoints` a foreign key on `(workspace_id, exploration_id, org_id)` to it. A run workspace has no exploration, so it can never match. Test: "binds a checkpoint's workspace to its own exploration" in `workbench.test.ts`. |
| 4428161947: bind controlled-record candidates to the recorded revision (P2) | Accepted, fixed | Confirmed: the candidate foreign key checked only the organization, so a record for package A could cite a candidate of package B. `candidate_assignments` gains a unique key on `(id, package_id, package_revision, org_id)` and `controlled_records` a foreign key on `(candidate_id, package_id, package_revision, org_id)` to it. Test: "binds a controlled record's candidate to the package revision it names" in `workbench.test.ts`. |

Both constraints are validated against stored rows when the migration runs; no product path records checkpoints or controlled records yet. Both tests fail without migration 019 and pass with it. The tenancy, dependency and preservation rollbacks take 019 off first. Full API suite on this branch: 600 pass, 2 fail (`command-boundary` SEC-01 and SEC-03, which fail the same way on `main` against this environment's trust-auth test database), 2 skipped.

Migration 019 follows 018 from #56, so this branch is built on #56 and should merge after it.
