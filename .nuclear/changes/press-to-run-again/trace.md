# Trace: A failed run on a Mac runs again with one press, not a passkey

| Need | Code | Test |
| --- | --- | --- |
| Settle with a press under a policy that presses send-backs | `services/api/src/work.ts` reconcilePressPolicy, reconcileRun | `services/api/test/signing-policy.test.ts` "under Light, settles a failed run's unknown outcome with a press" |
| Still signed where send-backs are signed or nothing covers the card | same | same file, "asks for a passkey to settle an unknown outcome once the settings sign send-backs"; `supervision.test.ts` "settles an unknown outcome with a person's signed reason" |
| One press settles and runs again | `apps/web/src/components/RunLog.tsx` Reconcile | `components/run-reconcile.test.tsx` |
| Honest words | RunLog.tsx unknownOutcomeText, `lib/next.ts` stalledLine | `run-reconcile.test.tsx`, `lib/next.test.ts` "does not say the daemon stopped answering" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a project whose signing settings send cards back with a press (Light, Balanced), a failed run whose outcome is unknown is settled and run again with one press in its run log, with no passkey; the reason is recorded with the policy it relied on. Where send-backs are signed, or no policy covers the card, it still asks for the passkey. The run log and the card no longer say the daemon stopped answering for a run that reported its end. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
