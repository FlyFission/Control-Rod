# Plan: live test-and-break loop for the web app

1. `e2e/live/stack.ts`: start the built control plane with embedded PostgreSQL in a throwaway home, the daemon with only the fake runtime, and a per-stack attestation CA; kill and restart either; swap a role's fake script per test.
2. `e2e/live/passkey.ts`: a software ES256 passkey with packed attestation and a `navigator.credentials` shim that works in Chromium, Firefox and WebKit.
3. `e2e/live/fixtures.ts`: worker stack, owner registered through the real setup page, signed-in page, a journal (console errors, page errors, 5xx, slow responses, screenshot plus axe at each step) and an automatic fixture that turns every failed expectation into a finding.
4. Suites: `lifecycle.spec.ts` (functional), `break.spec.ts` (break it), `personas.spec.ts` (journeys for the judge).
5. `tools/break-loop/`: `findings.mjs` (merge, next, set, summary over `ledger.json`), `loop.sh` (the Ralph loop with trust-surface and idle guards), `PROMPT.md` (one pass), `JUDGE.md` (persona judge).
6. Run the first pass on Chromium; fix the in-scope findings test first; record the rest in the ledger.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The three suites run against the real stack on Chromium with evidence retained here, the loop tooling works end to end (run, merge, next, set), each fix has a test that failed before it, and the owner has made the merge decision. Nothing here claims Firefox or WebKit results (their browsers could not be downloaded in this environment), or that the persona judge's opinions are right.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
