# Ship: Choose what needs your passkey: cards finish on their own by default

Release decision: **pending the owner's recorded yes** (kernel decision function changed).

## Signature

| Decision | Question | Answer (owner's words) | Given | Where | Recorded by |
|---|---|---|---|---|---|
| Merge PR #198, including the kernel decision function `kernel/src/transition.rs` | "Merge PR #198 (signing settings, compact cards, full log, one-press SCRAM), including its kernel/src/transition.rs change?" | Yes, merge #198 (option chosen on a decision card) | 2026-11-25T11:09:55Z | Project thread "Make cards finish without Ben stepping in", decision cmsg_01JQf1P5cs98pyQ9mZyGHPrK4MGqoc5V4qgJcUhNthTsxQ | Claude (project thread) |

- Rollback: revert the merge. Migration 028 only marks a field mutable; a stored `signing_policy` is ignored by the old kernel path, which signs every step.
- Monitoring after merge: on a Light project a new card goes from Ready to Accepted without a press; `decision.auto-skipped` events say why one did not.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

An owner chooses, per project and with one passkey tap, which card steps need a passkey (Light, Balanced, Everything, or each step). Under Light a routine card is released when intake drafts it and accepted when its blind check passes, with no person and no passkey; send-back and reject are a press. Every such decision records the signed policy it relied on. Nuclear-grade, Safety/Material and restricted-lane work is signed every time. Kernel, API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
