# Ship: control room and the usage-limits module

Release decision: **draft pull request for owner review; no merge is authorized by this record.**

- **Proposed:** merge to `main` after a Codex blind check and the owner's yes on the screenshots.
- **Not claimed:** CodexBar parsing against a real binary. Fixtures were built from CodexBar's source (0.85.1); the release download was blocked in the build environment. A provider CLI that CodexBar launches may show its own sign-in prompt (ADR 0025).
- **Trust surface:** `docs/adr/0025-usage-engine.md` needs the owner's recorded yes (Signature table below) before merge.

## Signature

| Decision | Question | Answer, word for word | When | Where | Recorded by |
|---|---|---|---|---|---|
| ADR 0025 (trust surface) | deferred: asked in the project thread | deferred | deferred | deferred | deferred |
- **Not claimed:** Claude Code's `utilization` scale is inferred, not documented (risk R-04).

Rollback: revert the merge. The settings key `usage_limits` can stay; nothing else reads it. The daemon's `usage-limits.json` in its own home can stay. No migration.

Monitoring after merge: compare the control room with Codex's `/status` and Claude Code's `/usage` on a real machine.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
