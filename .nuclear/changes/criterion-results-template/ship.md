# Ship: Checkers get a filled-in criterion results file to complete

Release decision: **approved by the owner.**

## Signature

| Decision | Question | Answer (owner's words) | Given | Where | Recorded by |
|---|---|---|---|---|---|
| Merge PR #222 on green | "Merge fix PR #222 on green so Grok's passing check counts?" | Yes, merge #222 on green (option chosen on a decision card) | 2026-11-25T20:57:44Z | Project thread "Make cards finish without Ben stepping in", decision cmsg_01JQf1P5cs98pyQ9mZyGHPrKXkMjXaf9vJTjYNKG667qwq | Claude (project thread) |

- Rollback: revert the merge. No migration.
- Monitoring after merge: a prepared Grok, Claude or Codex check counts instead of failing with "criterion-results.json does not match the schema".

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Every prepared pre-check receives inputs/criterion-results.template.json, which is schema-valid and lists the exact package, revision, manifest digest and every current criterion and mapped check, and the brief tells the checker to copy and fill it. The server's validation is unchanged. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
