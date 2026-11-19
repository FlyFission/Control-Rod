# Basis: Plannotator pattern note

**Change slug:** `plannotator-patterns`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-16
**Decision this basis supports:** whether `docs/patterns/plannotator.md` is accepted as design input. It lists ideas Control Rod may borrow from Plannotator (items PL1 to PL11), each with a decision. This change is documentation only.

## Mission / need

The owner asked what Control Rod can learn from Plannotator, then asked for a pattern note. Several Plannotator practices match open Control Rod work: the review panel's anchored findings, plan approval in daemon runs, the web app's Inbox and kernel state changes.

## Scope

In scope: the pattern note, one line in `docs/patterns/README.md`, and this change record. Out of scope: any change to code, `spec/`, policies, workflows, red-team fixtures or the kernel. Each item adopted later gets its own change record.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Write the pattern note. | "yes, write the pattern note" | 2026-11-16, Claude Code session for this pull request, in reply to the offer to write `docs/patterns/plannotator.md` | Write the note with a decision for each item, and its change record. | Building any item; the copied-wording check, which needs someone other than the author. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| Plannotator is licensed MIT OR Apache-2.0 at the studied commit, so the clean-room roles are not required. | `LICENSE-MIT` and `LICENSE-APACHE` at commit `12974486d3aee98e265de588cf525876aff44fff`. | A file to be ported carries a different license, as some icon sets do. |
| The note's claims about Plannotator match the source at that commit. | Read by the authoring agent from a scratch clone (E-01). | A reviewer finds a cited path or behavior that does not match the commit. |
| Whether a `PermissionRequest` hook fires under `claude -p` is unknown. | Not tested; recorded as an open question in PL4. | Do not design PL4 until it is checked on the real CLI. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The pattern note `docs/patterns/plannotator.md` is complete, each item has a decision, and the owner has reviewed it. No product code is part of this change; no behavior claim is made about Control Rod.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
