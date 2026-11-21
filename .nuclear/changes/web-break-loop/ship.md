# Ship: live test-and-break loop for the web app

Release decision: **proposed merge after review; the owner retains the merge decision.**

- **Proposed:** merge the live suites, the break loop tooling and the four fixes (F-01 to F-04 in trace.md).
- **Not claimed:** Firefox or WebKit results; that the persona judge is right; that the app is free of the open findings below; the full API suite (targeted files only).
- **Owner decisions requested:** (1) approve or return the branch; (2) whether to add the on-demand live workflow in `proposed-live-workflow.yml` (no schedule: the owner asked on 2026-11-21 that nothing be scheduled) (a trust surface, so it waits for your recorded yes); (3) D3 and D4 in basis.md are the agent's own choices and open to you.

## Open findings after the first pass

From `apps/web/e2e/live/ledger.json`. The loop takes these next unless the owner says otherwise.

| Severity | Finding | Where it shows |
|---|---|---|
| major | A lost run shows "Lost: the daemon stopped answering" on the case page with no way to run it again there (the inbox has the instruction). | Case page, Runs. Overlaps PR #107's card actions. |
| major | For the 90 s before a killed daemon's lease lapses, the case shows the run as "Starting" with nothing saying the daemon is gone. | Case page, board. |
| major | With the network down, Enter in quick add locks the field with no message; the send resumes silently when the network returns. | Board quick add. |
| major | A link to a package that does not exist says "Could not load package", which reads as an outage. | Package page. |
| minor | With no daemon or agent set up, a new user classifies a card and nothing says why nothing happens or what to start. | Board, first run. |
| minor | At 390 px the page scrolls sideways and some board controls are smaller than 24 px. | Board on a phone. |
| minor | The board's card for a package whose pre-check is held for an independent runtime says "Needs you: Return for revision"; the actual next step is the override on the case page. | Board card. Observed while building the lifecycle test; overlaps PR #107. |

Monitoring after merge: run the live suites (or the loop) after each board or daemon change; watch the ledger for findings that reopen after being marked fixed, and the daemon log for repeated 401s, which would mean the token re-read is not taking.

Rollback: revert the merge. The daemon change is backward compatible (a token in `CONTROLROD_DAEMON_TOKEN` behaves as before); no API contract, schema or stored data changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The three suites run against the real stack on Chromium with evidence retained here, the loop tooling works end to end (run, merge, next, set), the four first-pass fixes each have a test that failed before them, and the owner has made the merge decision. Nothing here claims Firefox or WebKit results (their browsers could not be downloaded in this environment), that the persona judge's opinions are right, or that the app is free of the open findings.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
