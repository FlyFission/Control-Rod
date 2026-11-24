# Ship: control room and the usage-limits module

Release decision: **merge to `main` after green CI; the owner approved ADR 0025 and the merge (Signature below).**

- **Codex blind check:** round 5 on head 98f9f6b3 returned VERDICT: MERGE (see verification).
- **Not claimed:** CodexBar parsing against a real binary. Fixtures were built from CodexBar's source (0.85.1); the release download was blocked in the build environment. A provider CLI that CodexBar launches may show its own sign-in prompt (ADR 0025).
- **Trust surface:** `docs/adr/0025-usage-engine.md`; the owner's answer is recorded in the Signature table below.

## Signature

| Decision | Question | Answer, word for word | When | Where | Recorded by |
|---|---|---|---|---|---|
| ADR 0025 (trust surface) and merge of pull request #171 | "Approve ADR 0025 and merge PR #171 to main?" (decision card) | "Yes, approve and merge #171" (option chosen on the card) | 2026-11-24 1:38 PM America/New_York (UTC-05:00) | Claude project thread "Build the control room usage dashboard" | Recorded by the agent (Claude); not signed for the owner |

- **Not claimed:** Claude Code's `utilization` scale is inferred, not documented (risk R-04).

Rollback: revert the merge. The settings key `usage_limits` can stay; nothing else reads it. The daemon's `usage-limits.json` in its own home can stay. No migration.

Monitoring after merge: compare the control room with Codex's `/status` and Claude Code's `/usage` on a real machine.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
