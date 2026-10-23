# SDD ledger — plan: docs/superpowers/plans/2026-10-23-platform-buildout.md

## Baseline and authority

Integration branch: `buildout/controlled-preparation-20261023`; integration commit `5793e05`. Main remains `40763d4`. Original worktrees and untracked planning copies are preserved.

Ruling: execute inline without another generic plan-approval round — the user explicitly requested the full plan followed by execution — cost if wrong is reversible local work; protected signature and publication gates remain intact.
Ruling: use existing GP field design as the immediate feature authority — the full referenced Platform Plan is absent — cost if wrong is later reconciliation, not an invented platform commitment.
Ruling: task 2 generates complete schema validation at the daemon boundary before lean internal projections — this closes silent field omission without maintaining a second handwritten wire contract — cost if wrong is an additional generator/type integration task.

## Interface preflight

| Producer → consumer | Contract | Finding |
|---|---|---|
| 1 → 2..14 | Pinned baseline and authority | MVP source available; main and signature gates distinct |
| 2 → 3,10 | Strict raw profile/generated boundary | Existing digest parser reusable; Runner API schemas need emission |
| 3 → 4 → 5 | Preparation schema/readiness → immutable store → UI | Follow GP field design; no early release |
| 5 → 6 → 7 | Manual enrollment → signed confirmation → prepared release | Protected edit gate must precede task 6 |
| 7 → 8 → 9 | Manifest → stale checks → criterion results | Each guards execution/acceptance, not just UI |
| 2 → 10; 9+10 → 11 | Strict wire + confinement → proposal roles | Manual path independent of agents |
| 9 → 12 → 13 → 14 | Accepted manual execution → pilot → domain → platform | Later modules require bounded interface specs and missing-plan reconciliation |

Task 1: complete — baseline reconciled, records/spec/plan created, README status qualified; strict packet validation passed. Main and all original worktrees preserved.
Tasks 2–14: pending.

## Gates

- Human signature for exact protected implementation at tasks 6 and 10 where relevant.
- Existing PR contributor DCO and non-author protected review before main integration.
- Full Platform Plan and deployment/tenant decisions before task 14 implementation.
- Release/deployment decision after pilot/recovery evidence.

## Task 2 evidence

Task 2: complete — strict API raw parser reuses kernel canonical-profile validation before JSON.parse; daemon validates complete raw TypeSpec-generated Job/LogReply/CompletionReceipt schemas before lean internal projection. Generated schema closure is embedded into the binary. Success without a receipt and mismatched receipt subjects are refused.

RED: `/tmp/controlrod-task2-api-red.log` showed duplicate keys/numeric/unicode violations admitted (17 focused cases); Go RED showed all seven malformed/incomplete responses admitted. Initial broad API invocation also exposed the known local PostgreSQL library requirement; focused profile test is database-independent.
GREEN: API 81 tests; API and web type checks; Go race suite. The initial Go integration fixtures lacked required wire lifecycle/lease fields; completed those fake-server responses instead of relaxing schemas. Schema closure now supports same-document anchors as emitted by TypeSpec. No kernel decision function or protected surface edited.

Ruling: retain lean internal Go projections only behind complete generated raw-schema validation — full contract is enforced before use and no second handwritten schema is introduced — cost if wrong is later generated Go struct adoption.
Ruling: reject undocumented 204 log/completion success — current TypeSpec promises a stop/lease response and a recorded receipt — cost if wrong is incompatibility with older nonconforming servers; main integration must deploy matching server/daemon.

Task 3: next — additive preparation contracts and pure readiness.
