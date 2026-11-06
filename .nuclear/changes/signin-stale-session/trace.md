# Trace: a sign-in page drawn from an out-of-date session

| Requirement | Code | Tests (`apps/web/src/pages/signin.test.tsx`) | Disposition |
|---|---|---|---|
| SS-01 A stale-page refusal redraws the page from a fresh session; other refusals are shown. | `SignIn.tsx` `STALE_SESSION`, `run` | three tests in "a sign-in page drawn from an out-of-date session" | implemented and tested |
| SS-02 Taking a new session redraws the app and drops what the earlier session loaded or submitted, and no earlier session request can put it back. | `lib/session.ts` `adoptSession`; `SignIn.tsx`; `Shell.tsx` logout | `src/lib/session.test.tsx`; gate tests in `signin.test.tsx` | implemented and tested |
| SS-03 Every observed change of the signed-in identity (this tab taking a new session, or a session refetch that finds a different user or a sign-out) runs one transition: the generation advances, every other query and mutation is cleared, and the app subtree remounts. No flow that waits on a request lets an earlier session's answer reach the next one, in the cache or in component state: the recovery read, the preparation save, reload and history, the criteria save, and sign-out (one at a time; an obsolete answer is not adopted, and the tab rereads the session instead). | `lib/session.ts` `adoptSession`, `watchSessionIdentity`, `stillCurrent`; `router.tsx` `SessionGate` (watcher and identity key); `SignIn.tsx` `run`; `PreparationPanel.tsx` `perform`, `reload`, `loadHistory`; `PackagePage.tsx` criteria save; `Shell.tsx` `logout` | `src/session-gate.test.tsx`; `src/components/shell.test.tsx`; delayed-response tests in `signin.test.tsx`, `preparation.test.tsx` and `criteria.test.tsx` | implemented and tested; mutation checked |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SS-01 is implemented with failed-first regression evidence, and the web suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
