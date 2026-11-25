# Basis: A calm card drawer

**Change slug:** `calm-drawer`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Approved by the owner, 2026-11-25.

## Mission / need

The owner, 2026-11-25, on a card whose Codex check failed: "This is overwhelming and most info isn't necessary. I have ADHD and this is brutal. The buttons don't even work either." The drawer showed custody, criteria, pre-check, switches, the raw run log with policy errors, script source in the outputs preview, a signing digest readout and a list of refused decisions, all at once.

Why the buttons seemed dead (reproduced on the live stack): Return with direction and Reject both open a note box first. The decision bar sat in a footer capped at 34% of the screen; the box opened below everything in it, below the screen edge, unfocused, so pressing either button changed nothing visible. Its Sign button was further down still.

## Proposal

1. The drawer leads with the title, one plain sentence and one primary step: Run again (a check or author run that ended without a result), Allow it (a check held for a second agent), Release or Accept, or Send back when the check found problems. Send back, Reject and Accept with findings sit behind "Other choices".
2. A runner error is said in plain words (`lib/plainError.ts`: the sign-in-folder limit, not signed in, usage limit, timeout, missing program; a short plain sentence as it is), with the raw text behind "Show technical details".
3. Everything else is folded under Details, one row per topic with a one-line summary: What was asked, Check result, Outputs, Agent runs, Who and how (custody, context and workflow switches, chips), Signing record (digest, what signing binds, why other decisions are closed). The full case page is unchanged.
4. The note box opens in view and focused, on the drawer and on the case page (shared `useDecisionSigner` and `ReasonBox`). Its prompts are questions: "What should change in the next revision?", "Why reject this work?".
5. The drawer is 560 px wide (a peek view like Linear's) and scrolls as one column.

## Out of scope

`spec/`, `services/`, `daemon/`, `kernel/`, `policies/`, `.github/`: untouched. The cause of the owner's failed check is PR #191. The card face and Run again from PR #193 are reused, not changed.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Opening a card shows its title, one plain sentence on where it stands and one primary step, with nothing else above Details. A runner error is said in plain words with the raw text behind a toggle. Send back and Reject open their note box in view and focused, and a signed Send back is recorded. Web tests, typecheck and the live drawer test pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
