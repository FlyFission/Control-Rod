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
| T-10 | Open findings are recorded with their test and evidence. | `apps/web/e2e/live/ledger.json` | 7 found in the first pass, all fixed in the second (F-05 to F-11); 0 open |

## Fixes from the first pass

| Finding | What a person saw | Cause | Fix |
|---|---|---|---|
| F-01 | After the control plane restarted (a crash, or restarting it alone), nothing ever ran again: cards sat in Ready and the daemon logged 401 forever. | The control plane writes a new daemon token at every start; `pnpm cr start` gave the daemon the old one in its environment. | The daemon reads `CONTROLROD_HOME/daemon.token` and re-reads it once after a 401; `cr start` and the live stack no longer pin the token in the environment. |
| F-02 | A card with a null character (a paste from a terminal) failed with "Something went wrong". | PostgreSQL refuses U+0000 in text and jsonb; the error became a 500. | The error handler answers 400 with the reason. |
| F-03 | Pressing `c` on the board opened the New change dialog over the quick add field. | Quick add's state update re-rendered between the two window listeners and removed the element Shell checked for. | Shell steps aside when the event was already handled. |
| F-04 | After Classify, focus fell to the page; a keyboard user had to start again from the top. | The focused button was removed. | The capture card takes focus. |

## Fixes from the second pass

The owner asked on 2026-11-21 to fix the open findings ("Fix anything that is broken or buggy yeah"). Each has a live expectation that failed before its fix and passes after (E-01); the soft expectations for F-05, F-06 and F-07 are now hard.

| Finding | What a person saw | Cause | Fix |
|---|---|---|---|
| F-05 | Offline, Enter in quick add locked the field with no message, and the send went through silently later. | React Query pauses mutations while offline by default. | Mutations always run (`main.tsx`), so a failed send fails at once; a network failure reads "Could not reach Control Rod. Check your connection and try again." (`api/client.ts`). |
| F-06 | A link to a package that does not exist said "Could not load package". | The page treated every error alike. | `PackageLoadError`: a 404 says there is no such package and links to Packages; other errors explain and offer Retry. Package and case pages. |
| F-07 | With no daemon, a new user classified a card and nothing said why nothing happened. | Nothing read the daemon's presence. | `lib/daemon.ts` reads `GET /runtimes` (`reported_at`, refreshed on every claim) and `DaemonNotice` says no daemon has connected and to run `pnpm cr start`, or that no agent is ready. Board, package and case pages. No contract change. |
| F-08 | A killed daemon left the run "Starting" for 90 s with nothing said. | As F-07. | The same notice says the daemon has not answered since a time, once its last report is 20 s old (it claims every 2 s) and fewer than three runs are running. |
| F-09 | A lost run had no way to run again on its case page, and on the package page its buttons sat in a closed panel. | The case page had no run actions; the run panel opened only while live. | The case page shows Requeue, or, when the run's process may still be alive, says to reconcile it first and links there; a run that needs the person opens by itself. |
| F-10 | On a 390 px phone the page scrolled 611 px sideways, and card titles were 18 px tap targets. | Cards' absolutely placed screen-reader text was positioned against the page, outside the board's scroller; titles had no minimum height. | `.bd-board` is `position: relative`; `.bd-title` is at least 24 px tall and wraps long words. |
| F-11 | A card whose pre-check was held for an independent runtime said "Needs you: Return for revision". | The next line offered the first allowed action. | A held pre-check is named as the next step (`lib/next.ts`, unit test), checked in the lifecycle test. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The three suites run against the real stack on Chromium with evidence retained here, the loop tooling works end to end (run, merge, next, set), each fix has a test that failed before it, and the owner has made the merge decision. Nothing here claims Firefox or WebKit results (their browsers could not be downloaded in this environment), or that the persona judge's opinions are right.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
