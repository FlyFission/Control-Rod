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
3. Plain words: a run that reported its end without proof says so ("Control Rod cannot prove every process it started has stopped (on macOS it never can)") instead of "the daemon stopped answering", which stays for a lapsed lease or a daemon restart. The card line drops "it may not have stopped" for those runs.

## Out of scope

`kernel/`, `policies/`, `spec/`, `.github/`, `tests/redteam/`, `daemon/`: untouched. Nuclear-grade, high-consequence and restricted-lane work is never covered by a policy, so it is signed every time, as before. Proving process exit on macOS (issue #178) is its own work.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a project whose signing settings send cards back with a press (Light, Balanced), a failed run whose outcome is unknown is settled and run again with one press in its run log, with no passkey; the reason is recorded with the policy it relied on. Where send-backs are signed, or no policy covers the card, it still asks for the passkey. The run log and the card no longer say the daemon stopped answering for a run that reported its end. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
