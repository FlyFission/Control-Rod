# Trace: live test-and-break loop for the web app

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | One request goes from a typed line to an accepted package on the real stack: capture, lane, intake, release (passkey), author run, pre-check override (passkey), pre-check, accept (passkey); the dependent package then becomes releasable; axe clean at each stop. | `lifecycle.spec.ts` | implemented and passing on Chromium (E-01) |
| T-02 | Input never becomes markup or script and never makes the server fail; blank lines add nothing; a 40-line paste adds exactly 40 even when Add is double clicked. | `break.spec.ts` "@break inputs" | implemented and passing on Chromium (E-01) |
| T-03 | A double click on Classify starts one intake; on Release, records one release. A stale tab cannot release twice. | `break.spec.ts` "@break double actions", "@break two tabs" | implemented and passing on Chromium (E-01) |
| T-04 | After the control plane restarts, the board recovers without a reload and new work still reaches the daemon. | `break.spec.ts` "the control plane restarts"; `client_token_test.go` | **fixed** (F-01): failed before, passes after (E-01, E-03) |
| T-05 | Text with U+0000 is refused with a 400 that says why; other control characters are stored as typed. | `null-character.test.ts`; `break.spec.ts` "control-chars" | **fixed** (F-02): 500 before, 400 after (E-02) |
| T-06 | `c` on the board opens quick add, not the New change dialog. | `personas.spec.ts` "keyboard-only" | **fixed** (F-03): failed before, passes after (E-01) |
| T-07 | After Classify, keyboard focus stays on the card instead of dropping to the page. | `personas.spec.ts` "keyboard-only" | **fixed** (F-04): failed before, passes after (E-01) |
| T-08 | An agent that writes markup, escapes and a symlink cannot run script or leak a file; the failed run says why. | `break.spec.ts` "@break hostile agent output" | implemented and passing on Chromium (E-01) |
| T-09 | A lost session leads to sign in. | `break.spec.ts` "a lost session" | implemented and passing (E-01) |
| T-10 | Open findings are recorded with their test and evidence. | `apps/web/e2e/live/ledger.json` | 7 open, listed in ship.md |

## Fixes from the first pass

| Finding | What a person saw | Cause | Fix |
|---|---|---|---|
| F-01 | After the control plane restarted (a crash, or restarting it alone), nothing ever ran again: cards sat in Ready and the daemon logged 401 forever. | The control plane writes a new daemon token at every start; `pnpm cr start` gave the daemon the old one in its environment. | The daemon reads `CONTROLROD_HOME/daemon.token` and re-reads it once after a 401; `cr start` and the live stack no longer pin the token in the environment. |
| F-02 | A card with a null character (a paste from a terminal) failed with "Something went wrong". | PostgreSQL refuses U+0000 in text and jsonb; the error became a 500. | The error handler answers 400 with the reason. |
| F-03 | Pressing `c` on the board opened the New change dialog over the quick add field. | Quick add's state update re-rendered between the two window listeners and removed the element Shell checked for. | Shell steps aside when the event was already handled. |
| F-04 | After Classify, focus fell to the page; a keyboard user had to start again from the top. | The focused button was removed. | The capture card takes focus. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The three suites run against the real stack on Chromium with evidence retained here, the loop tooling works end to end (run, merge, next, set), the four first-pass fixes each have a test that failed before them, and the owner has made the merge decision. Nothing here claims Firefox or WebKit results (their browsers could not be downloaded in this environment), that the persona judge's opinions are right, or that the app is free of the open findings.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
