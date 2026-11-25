# Risk: A failed run on a Mac runs again with one press, not a passkey

- A press could requeue a run whose process is still alive, so two copies run. This is the same judgement the signed reconcile asks for, now made by a press under a policy the owner signed. Mitigation: only where the owner's signed policy already lets a card be sent back with a press; never for Nuclear-grade, high-consequence or restricted-lane work; not once the policy's passkey is revoked or its signer lacks reconcile authority. A requeued run is a new attempt (generation fence), so a late report from the old one is retained, never applied.
- The press is recorded: the reconciliation evidence names the person, the policy id and version, and the reason.
- No trust surface is touched.

## Selected mode

- **Mode:** Standard
- Basis: reversible by revert, no migration, no trust surface; widens a press only inside an existing signed policy.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a project whose signing settings send cards back with a press (Light, Balanced), a failed run whose outcome is unknown is settled and run again with one press in its run log, with no passkey; the reason is recorded with the policy it relied on. Where send-backs are signed, or no policy covers the card, it still asks for the passkey. The run log and the card no longer say the daemon stopped answering for a run that reported its end. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
