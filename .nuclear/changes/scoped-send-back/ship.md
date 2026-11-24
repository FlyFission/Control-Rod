# Ship: scoped send-back after a failed check

Release decision: **pull request for owner review.** The owner asked for this to be built and merged once Codex's review is clean and CI is green. No trust surface changes.

- **Proposed:** merge to `main`. The spec change is additive inside API 0.1: optional `evidence`, `location` and `scope_paths` on `Finding`; new `FindingLocation`, `FindingPath` and `ScopeDrift`; optional `scope_drift` on `PackageView`. No `schema_version` bump.
- **Not claimed:** drift is reported, not refused. A checker can still name too narrow a scope (risk R-01). Planted text in a finding gets no new check here (risk R-02).
- **Not claimed:** the round cap stays 3 and is not configurable.

Rollback: revert the commit. No migration is added. Verifications stored with the new finding fields stay in the database; after a revert, the old `Finding` schema refuses extra fields, so any path that re-validates a stored verification would need checking before a revert. `package.scope-drift` events stay in the append-only log.

Monitoring after merge: count `package.scope-drift` events against `package.revising` events. Drift on most rework rounds means checkers name scopes too narrowly, or authors ignore them. Watch for findings where every blocking finding lacks `evidence`, which means the role text is not being followed.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
