# Ship: A failed run on a Mac runs again with one press, not a passkey

Release decision: **pending the owner's yes.**

## Signature

Owner (sole maintainer): pending.

- Rollback: revert the merge. No data, route or migration change; reconciliations already recorded stay as they are.
- Monitoring after merge: on the owner's Mac with Light signing, a failed check's run log shows "It has stopped. Run it again", one press queues a new check, and the run's reconciliation names the signing policy.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a project whose signing settings send cards back with a press (Light, Balanced), a failed run whose outcome is unknown is settled and run again with one press in its run log, with no passkey; the reason is recorded with the policy it relied on. Where send-backs are signed, or no policy covers the card, it still asks for the passkey. The run log and the card no longer say the daemon stopped answering for a run that reported its end. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
