# Risk: live test-and-break loop for the web app

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-21 instruction (basis D1, D2).
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec change. The API change is to the error handler only (a database refusal of U+0000 becomes a 400 instead of a 500); no refusal rule, signing, lane or custody behavior changes.
- Scope: see basis.md.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The passkey shim weakens what the suites prove about sign-in and signing. | The shim only answers `navigator.credentials`; the server verifies challenge, origin, RP ID, signature, counter and the packed attestation chain against a throwaway CA written into the stack's own `trust-anchors`. The CA and key live in the stack's temp directory and are deleted with it. | Any server-side bypass, test-only route or flag added for the suites. |
| R-02 | The fake runtime is mistaken for agent behavior. | Only enabled in the stack with `CONTROLROD_ALLOW_FAKE=1`, and the daemon's PATH drops any directory holding a real agent CLI, so the stack refuses to start unless `runtimes=fake` alone is offered. Findings are about the app, not agent quality. | A live run that launches a real agent CLI. |
| R-03 | The loop edits a trust surface or weakens a test to get green. | `PROMPT.md` forbids both; `loop.sh` stops after any pass whose commits or working tree touch `policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` or `kernel/`, leaving the change for a person. | A loop commit touching a trust surface. |
| R-04 | The daemon's token re-read lets a stale or foreign token in. | It re-reads only the file it started from (`CONTROLROD_HOME/daemon.token`, written 0600 by the control plane), only after a 401, once per request; a token given in the environment is never re-read. The control plane still rotates the token on every start. | A re-read from any other path, or retrying on statuses other than 401. |
| R-05 | Focusing the capture card after Classify moves focus unexpectedly. | It moves only when focus was inside that card or on the page body (the button that had it was removed). | Focus taken from another field the person moved to. |
| R-06 | The `c` shortcut change stops New change opening from `c` elsewhere. | Shell only steps aside when the event was already handled (`defaultPrevented`), which quick add does on the board; other pages have no quick add. | `c` doing nothing on a page without quick add. |

## Selected mode

- **Mode:** Standard
- Basis: test tooling plus four small user-visible fixes; no contract or protected surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The three suites run against the real stack on Chromium with evidence retained here, the loop tooling works end to end (run, merge, next, set), each fix has a test that failed before it, and the owner has made the merge decision. Nothing here claims Firefox or WebKit results (their browsers could not be downloaded in this environment), or that the persona judge's opinions are right.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
