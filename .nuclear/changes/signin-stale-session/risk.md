# Risk: a sign-in page drawn from an out-of-date session

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-05 pilot report.
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec major version. No server, wire, schema or migration change.
- Scope: `apps/web/src/pages/SignIn.tsx` and its test.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | A real refusal is hidden behind a reload. | Only the four codes that mean the page's session is out of date reload; others are shown (test). If the session cannot be read, the original refusal is shown. | A refusal of another kind not shown. |
| R-02 | Reloading grants access. | The page only reads `/auth/session`; the server still decides who is signed in. | Any change to server authorization. |

## Selected mode

- **Mode:** Standard
- Basis: one web page's error handling; reversible; authorization stays on the server.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

SS-01 is implemented with failed-first regression evidence, and the web suite passes.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
