# Risk: a sign-in page drawn from an out-of-date session

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-05 pilot report.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec major version. No server, wire, schema or migration change.
- Scope: sign-in and its stale-session recovery (`apps/web/src/pages/SignIn.tsx`), sign-out (`Shell.tsx`), the identity transition and session helpers (`lib/session.ts`), the session gate (`SessionGate` in `router.tsx`), the preparation save, reload and history (`PreparationPanel.tsx`) and the criteria save (`PackagePage.tsx`), with their tests.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A real refusal is hidden behind a reload. | Only the four codes that mean the page's session is out of date reload; others are shown (test). If the session cannot be read, the original refusal is shown. | A refusal of another kind not shown. |
| R-02 | Reloading grants access. | The page only reads `/auth/session`; the server still decides who is signed in. | Any change to server authorization. |
| R-03 | Session isolation: an answer to a request begun under an earlier session (the recovery read, a preparation save, reload or history read, a criteria save, a sign-out) lands in the next session's cache or component state and shows one person's data to another. | Generation guard (`sessionGeneration`, `stillCurrent`) checked right after each await, before the cache or any component state (draft, ETag, messages) changes; a sign-out answer from an earlier generation is dropped and the button is disabled while one is pending; delayed-response tests for each flow, each shown to fail with its guard removed (`evidence/mutation.log`). | Any flow that changes the cache or its own state after an await without the guard, or a delayed-response test that passes with its guard removed. |
| R-04 | The signed-in identity changes without this tab taking a new session (another tab signs out and someone else signs in; this tab refetches the session on focus or an invalidation), so the generation does not move and the earlier person's cache and editor state carry into the new identity. | One transition in `lib/session.ts`: `adoptSession` and a query cache subscription on the session query (`watchSessionIdentity`, installed by the session gate) both advance the generation and clear every other query and mutation, synchronously, before anything renders the new identity; the gate keys the app by identity so a change remounts it. Tests: refetched different user and refetched sign-out each advance the generation, clear cached data and drop component state; a refetch of the same person keeps everything. Watcher and key each shown to matter by mutation. | A refetch that changes the identity without advancing the generation, or a session-owned subtree not under the identity key. |

## Selected mode

- **Mode:** Standard
- Basis: web client session and cache handling across sign-in, sign-out and two save flows; reversible; authorization stays on the server.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SS-01 is implemented with failed-first regression evidence, and the web suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
