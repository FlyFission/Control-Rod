# Trace: a sign-in page drawn from an out-of-date session

| Requirement | Code | Tests (`apps/web/src/pages/signin.test.tsx`) | Disposition |
|---|---|---|---|
| SS-01 A stale-page refusal redraws the page from a fresh session; other refusals are shown. | `SignIn.tsx` `STALE_SESSION`, `run` | three tests in "a sign-in page drawn from an out-of-date session" | implemented and tested |
| SS-02 Taking a new session redraws the app and drops what the earlier session loaded or submitted, and no earlier session request can put it back. | `lib/session.ts` `adoptSession`; `SignIn.tsx`; `Shell.tsx` logout | `src/lib/session.test.tsx`; gate tests in `signin.test.tsx` | implemented and tested |
| SS-03 No flow that waits on a request lets an earlier session's answer reach the next session: the recovery read, the preparation save and reload, and the criteria save. | `SignIn.tsx` `run`; `PreparationPanel.tsx` `perform`, `reload`; `PackagePage.tsx` criteria save | delayed-response tests in `signin.test.tsx`, `preparation.test.tsx` and `criteria.test.tsx` | implemented and tested; mutation checked |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SS-01 is implemented with failed-first regression evidence, and the web suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
