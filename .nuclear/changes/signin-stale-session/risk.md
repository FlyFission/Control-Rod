# Risk: a sign-in page drawn from an out-of-date session

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-05 pilot report.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec major version. No server, wire, schema or migration change.
- Scope: sign-in and its stale-session recovery (`apps/web/src/pages/SignIn.tsx`), sign-out (`Shell.tsx`), the shared session cache helper (`lib/session.ts`), the preparation save and reload (`PreparationPanel.tsx`) and the criteria save (`PackagePage.tsx`), with their tests.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A real refusal is hidden behind a reload. | Only the four codes that mean the page's session is out of date reload; others are shown (test). If the session cannot be read, the original refusal is shown. | A refusal of another kind not shown. |
| R-02 | Reloading grants access. | The page only reads `/auth/session`; the server still decides who is signed in. | Any change to server authorization. |
| R-03 | Session isolation: an answer to a request begun under an earlier session (the recovery read, a preparation save or reload, a criteria save) lands in the next session's cache and shows one person's data to another. | Generation guard (`sessionGeneration`, `setIfSameSession`); `adoptSession` cancels queries in flight and clears other queries and mutations; the recovery read discards its result if the generation moved; delayed-response tests for each flow, each shown to fail with its guard removed (`evidence/mutation.log`). | Any flow that writes to the cache after an await without the guard, or a delayed-response test that passes with its guard removed. |

## Selected mode

- **Mode:** Standard
- Basis: web client session and cache handling across sign-in, sign-out and two save flows; reversible; authorization stays on the server.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SS-01 is implemented with failed-first regression evidence, and the web suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
