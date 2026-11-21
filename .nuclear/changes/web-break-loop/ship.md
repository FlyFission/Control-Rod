# Ship: live test-and-break loop for the web app

Release decision: **proposed merge after review; the owner retains the merge decision.**

- **Proposed:** merge the live suites, the break loop tooling and the eleven fixes (F-01 to F-11 in trace.md).
- **Not claimed:** Firefox or WebKit results; that the persona judge is right; that the app is free of problems the suites do not look for; the full API suite (targeted files only).
- **Owner decisions requested:** (1) approve or return the branch; (2) whether to add the on-demand live workflow in `proposed-live-workflow.yml` (no schedule: the owner asked on 2026-11-21 that nothing be scheduled) (a trust surface, so it waits for your recorded yes); (3) D3 and D4 in basis.md are the agent's own choices and open to you.

## Findings

The first pass found seven problems it could not fix at once; the owner asked for them to be fixed, and the second pass fixed all seven (F-05 to F-11 in trace.md). The ledger (`apps/web/e2e/live/ledger.json`) has none open, and the last Chromium run found nothing new.

Monitoring after merge: run the live suites (or the loop) after each board or daemon change; watch the ledger for findings that reopen after being marked fixed, and the daemon log for repeated 401s, which would mean the token re-read is not taking.

Rollback: revert the merge. The daemon change is backward compatible (a token in `CONTROLROD_DAEMON_TOKEN` behaves as before); no API contract, schema or stored data changes. The web fixes read only existing endpoints.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The three suites run against the real stack on Chromium with evidence retained here, the loop tooling works end to end (run, merge, next, set), each fix has a test that failed before it, and the owner has made the merge decision. Nothing here claims Firefox or WebKit results (their browsers could not be downloaded in this environment), that the persona judge's opinions are right,.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
