# Ship: role casting design spec

Release decision: **ship with named risk, documentation only (2026-11-18).** The owner authorized the merge after the GitHub Codex and Copilot reviews. No implementation is authorized by this record; each milestone opens its own.

- **Shipped:** the spec, ADR 0023 as **Proposed**, the pattern note and this packet.
- **Owner decisions recorded:** C-1 to C-9 and D-1, D-2, D-3 and D-6 (spec section 15), from the owner's acceptance in conversation, not a signed artifact (verification E-08).
- **Reviewed:** the spec commit `2a9c46bd`, once, by Codex CLI (gpt-6.2-sol), agy (Gemini 4 Hydrogen (High), from the CLI log) and Grok Build (grok-4.7-build), from one brief the authoring side wrote; all three returned FLAWED AS WRITTEN (15, 9 and 9 findings), dispositioned in `evidence/05-review-dispositions.md`. Then the GitHub Copilot reviewer (CP-1 to CP-8) and the GitHub Codex reviewer (GC-1, GC-2) on the revised spec, every finding fixed; the Codex reviewer found no issues on `673d1ec`, and every review thread is resolved. CI is green.
- **Named risks carried into the build:**
  1. The revised spec has had no second cross-vendor round with a full brief; the GitHub reviewers read diffs only. Proposal: run one before C1 starts.
  2. No person has reviewed the spec.
  3. Open decisions: the C-7 discipline, D-4 (canary evidence bar) and D-5 (who seeds canaries). C4 and C8 cannot start until they are answered.
  4. ADR 0023 is Proposed; accepting it is C0, an owner act.
- **Not claimed:** any implemented behavior; that any model is better than another at any duty (the spec's model suggestions are hypotheses for trials); that casting makes checks independent; that any Capital Projects role is ready; that the spec has had an independent review.

Rollback: revert the commit. Documentation only; no code, schema or wire change.

Monitoring after merge: each milestone opens its own change record; watch for any slice that changes a cast without a signed sheet, lets a sheet override separation, or ships a Capital Projects role before its prerequisites.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The design spec, ADR 0023 (Proposed) and the pattern note are complete, and the owner has reviewed them. No product code is part of this change; role casting is designed, not implemented, and no behavior claim is made here beyond what the spec states.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
