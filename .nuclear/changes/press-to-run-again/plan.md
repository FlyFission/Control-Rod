# Plan: A failed run on a Mac runs again with one press, not a passkey

1. Reproduce on the owner's install (read-only, his browser): the triage card's run R-e976da2b, failed in 0.6 s before launch, held as outcome unknown with "the daemon sent no proof".
2. Server: let the signing policy cover reconcile the way it covers send-back. Web: one-press settle-and-run-again; honest wording.
3. API tests (signing-policy suite), web tests, both typechecks, draft PR.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a project whose signing settings send cards back with a press (Light, Balanced), a failed check runs again once on its own, and after that a failed run whose outcome is unknown is settled and run again with one press in its run log, with no passkey; the reason is recorded with the policy it relied on. Where send-backs are signed, or no policy covers the card, it still asks for the passkey. The run log and the card no longer say the daemon stopped answering for a run that reported its end. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
