# Ship: role casting design spec

Release decision: **design spec and proposed ADR for owner review; no implementation authorized by this record.**

- **Proposed:** merge the spec, ADR 0023 as Proposed, the pattern note and this packet as documentation only.
- **Not claimed:** any implemented behavior; that any model is better than another at any duty (the spec's model suggestions are hypotheses for trials); that casting makes checks independent; that any Capital Projects role is ready; that the spec has had an independent review; that the revised spec has been reviewed by anyone.
- **Reviewed:** the spec commit `2a9c46bd`, once, by Codex (gpt-6.2-sol), agy (Gemini 4 Hydrogen (High), from the CLI log) and Grok Build (grok-4.7-build), from one brief the authoring side wrote. All three returned FLAWED AS WRITTEN: 15, 9 and 9 findings. None was rejected in full; four were partly accepted (three with a part rejected on repository evidence, one with a part deferred to C-1); everything accepted was fixed (`evidence/05-review-dispositions.md`). Grok read the repository; Codex and agy saw only the prompt.
- **Still open:** a second review round on the revised spec (proposal: the same three CLIs on the fix commit's diff, with a brief that asks whether each disposition holds); a person review; owner decisions C-1 to C-9, of which C-1 now has three options, C-5 is split, and C-9 is new.
- **Owner decisions requested:**
  1. Approve the spec and ADR 0023, or return them with changes.
  2. Decisions C-1 to C-9 and D-1, D-2, D-3 and D-6 are recorded (spec section 15, 2026-11-18). Still to answer: the C-7 discipline, D-4 (canary evidence bar) and D-5 (who seeds canaries), all before C4 or C8 starts.
  3. Say whether to run a second cross-vendor round on the revised spec before approval, and whether to add a person review.

Rollback: revert the commit. Documentation only; no code, schema or wire change.

Monitoring after merge: each milestone opens its own change record; watch for any slice that changes a cast without a signed sheet, lets a sheet override separation, or ships a Capital Projects role before its prerequisites.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
