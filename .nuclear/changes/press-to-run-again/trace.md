# Trace: A failed run on a Mac runs again with one press, not a passkey

| Need | Code | Test |
| --- | --- | --- |
| Settle with a press under a policy that presses send-backs | `services/api/src/work.ts` reconcilePressPolicy, reconcileRun | `services/api/test/signing-policy.test.ts` "under Light, settles a failed run's unknown outcome with a press" |
| Still signed where send-backs are signed or nothing covers the card | same | same file, "asks for a passkey to settle an unknown outcome once the settings sign send-backs"; `supervision.test.ts` "settles an unknown outcome with a person's signed reason" |
| Turning Light on starts waiting drafts | `services/api/src/admin.ts` project.set-signing-policy | `signing-policy.test.ts` "starts the drafts already waiting in the project once Light is turned on" |
| A failed check retries once on its own | `services/api/src/work.ts` retryFailedCheck, requeueChecks | `signing-policy.test.ts` "runs a check that failed without a verdict again once on its own" |
| Draft asks for Release, not Edit | `apps/web/src/lib/next.ts` nextLine | `lib/next.test.ts` "a draft" |
| Cards follow the board's column agents unless overridden | `apps/web/src/components/NewWorkModal.tsx` agentsChosen | `components/newwork.test.tsx` "captures with resolved project preferences", "supports capture settings" |
| One press settles and runs again | `apps/web/src/components/RunLog.tsx` Reconcile | `components/run-reconcile.test.tsx` |
| Honest words | RunLog.tsx unknownOutcomeText, `lib/next.ts` stalledLine | `run-reconcile.test.tsx`, `lib/next.test.ts` "does not say the daemon stopped answering" |
| Cards show plain words, not the runner's text; project settings folded away | `apps/web/src/lib/plainError.ts`, `lib/next.ts`, `features/board/BoardView.tsx` | `lib/next.test.ts` "says a runner error in plain words on the card" |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On a project whose signing settings send cards back with a press (Light, Balanced), a failed check runs again once on its own, and after that a failed run whose outcome is unknown is settled and run again with one press in its run log, with no passkey; the reason is recorded with the policy it relied on. Where send-backs are signed, or no policy covers the card, it still asks for the passkey. The run log and the card no longer say the daemon stopped answering for a run that reported its end. API and web tests and both typechecks pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
