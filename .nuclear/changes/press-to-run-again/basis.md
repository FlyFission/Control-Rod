# Basis: A failed run on a Mac runs again with one press, not a passkey

**Change slug:** `press-to-run-again`
**Owner:** Ben Huffer
**Date:** 2026-11-25
**Status:** Built, for owner review.

## Mission / need

The owner, 2026-11-25, dogfooding Control Rod on its own GitHub issues from his Mac: "I still haven't got many cards all the way through to accepted without hitting hiccups." His stuck card read "Needs you: The check could not finish, and it may not have stopped. Open its run log to confirm, then run it again", and the run log said the daemon had stopped answering and asked him to write a reason and sign with his passkey.

Neither was true to what happened. The check had failed before it started (the Codex login-folder size limit, fixed in PR #191) and the daemon had reported that. The hold is structural on macOS: process group containment can never prove every process of a failed run stopped, so **every** failed or stopped run on a Mac lands in "outcome unknown" and needs a signed reconcile before it can run again. That is a passkey per failure, against the owner's direction that passkeys are for big things only (signing-policy, 2026-11-25).

## Proposal

1. `reconcileRun` (services/api/src/work.ts) accepts a press, with no passkey, when the project's signed signing policy covers the card and takes send-back ("return") as a press, the policy's passkey is still valid and its signer holds reconcile authority for the card. The reason is still required and the evidence records the policy id and version. Otherwise it stays signed, as before.
2. The run log (RunLog.tsx) offers **It has stopped. Run it again** where the card's send-back is a press: one press settles the run and queues it again. Elsewhere the signed form stays.
3. Turning a project's signing to release on its own (Light, Balanced) now starts the drafts already waiting in that project (`project.set-signing-policy` calls `autoDecide(release)` on them), as if the policy had been there when intake drafted them. The owner hit this the same day: two cards drafted a minute before he turned Light on stayed drafts asking for a passkey.
4. A check that failed without a verdict (the checker crashed or wrote a file Control Rod could not read) is Control Rod's problem, not the owner's. Where the policy releases cards on its own, its first attempt is settled and queued again once by the policy (`retryFailedCheck`); a second failure stops for the person with the one-press Run again. Every refusal a requeue can meet is read first (`requeueChecks`), so a refused retry writes nothing.
5. A draft that can be released reads "Needs you: Release", not "Needs you: Edit draft".
6. Agents are a board-level choice (the owner, 2026-11-25: "I don't think people need to do this at the card level... 90+% of the time, you're just following the default"). The New change dialog no longer pins the author and checker on every request: it adds an `[author:]` or `[checker:]` tag only when the person picks one for this card under More settings, so cards follow the agent picked at the top of each board column, and a later change to that pick reaches cards not yet started. The summary says "board column pick".
7. Plain words: a run that reported its end without proof says so ("Control Rod cannot prove every process it started has stopped (on macOS it never can)") instead of "the daemon stopped answering", which stays for a lapsed lease or a daemon restart. The card line drops "it may not have stopped" for those runs.

## Out of scope

`kernel/`, `policies/`, `spec/`, `.github/`, `tests/redteam/`, `daemon/`: untouched. Nuclear-grade, high-consequence and restricted-lane work is never covered by a policy, so it is signed every time, as before. Proving process exit on macOS (issue #178) is its own work.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a project whose signing settings send cards back with a press (Light, Balanced), a failed check runs again once on its own, and after that a failed run whose outcome is unknown is settled and run again with one press in its run log, with no passkey; the reason is recorded with the policy it relied on. Where send-backs are signed, or no policy covers the card, it still asks for the passkey. The run log and the card no longer say the daemon stopped answering for a run that reported its end. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
