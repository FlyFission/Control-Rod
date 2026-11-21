# Basis: live test-and-break loop for the web app

**Change slug:** `web-break-loop`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-21
**Decision this basis supports:** whether the live suites, the break loop tooling and the four fixes the first pass made are merged.

## Mission / need

Control Rod is meant for thousands of people working in different ways. The existing browser specs drive the app against recorded fixtures, so nothing exercised the real control plane, database and daemon together from a browser, and nothing tried to break them. The owner asked how best to test the web app as its users meet it, both that it works and how it feels to use, and to try to break it so it can be fixed, with Ralph loops; then approved building it to expedite getting the product to a fully working state (D1, D2).

## Scope

In scope: `apps/web/e2e/live/` (stack, passkey shim, fixtures, flows, three suites, ledger, README), `apps/web/playwright.live.config.ts`, `tools/break-loop/` (findings ledger tool, loop script, pass prompt, persona judge), and the fixes for findings from the first pass: `apps/web/src/components/Shell.tsx`, `apps/web/src/features/board/CaptureCard.tsx`, `services/api/src/app.ts` (error handler), `daemon/internal/runner/client.go` and `daemon.go`, `daemon/cmd/controlrod/main.go`, `scripts/cr.mjs`, with their tests; and the second-pass fixes (D5): `apps/web/src/main.tsx`, `api/client.ts`, `components/PackageLoadError.tsx`, `components/DaemonNotice.tsx`, `lib/daemon.ts`, `lib/next.ts`, `components/RunLog.tsx`, `features/board/BoardView.tsx`, `useBoardData.ts`, `board.css`, `features/case/CasePage.tsx`, `pages/PackagePage.tsx`, `styles.css`, with their tests. Out of scope: any trust surface (no policy, red-team, workflow, spec or kernel change); a CI job for the live suites (a workflow change, proposed in `ship.md` for the owner).

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Build a harness that tests the web app as people use it and tries to break it, with a repeating fix loop. | "What’s the best way for you to test web applications like this?  And optimize it with Ralph loops and other things.  Like from an ender standpoint, like firing it out making sure it’s functional but also looking at it from the user standpoint.  And trying to do different things to help break it so that we could fix it and make it better." | 2026-11-21, Claude project "Control Rod", project chat | Build functional, persona and break-it passes against the real app and a loop that fixes findings. | Choosing which findings in other threads' areas to fix here. |
| D2 | Go ahead with the harness and the first loop against the board. | "Sure, go ahead yeah I’ve been trying to work this towards completion and would love to expedite it in any way possible I think this would help" | 2026-11-21, Claude project thread "Build a test-and-break loop for the web app", in reply to the coordinator's four-pass proposal | Build it, run the first loop, fix what is in scope, open a pull request. | Merging; any trust-surface change; a CI workflow. |
| D3 | Fix in this pull request only findings outside the areas PR #106 and PR #107 are changing; report the rest. | none: authoring agent's choice, open to the owner | 2026-11-21, this thread | Board card actions and the agent panel are left to their threads; findings there are in the ledger. | Holding back a fix the owner wants here. |
| D4 | The daemon reads its token from `daemon.token` and re-reads it once after a 401, instead of the control plane keeping its token across restarts. | none: authoring agent's choice, open to the owner | 2026-11-21, this thread | Keeps the per-start token rotation and fixes the stuck daemon. | Changing how the control plane issues tokens. |
| D5 | Fix the seven findings left open after the first pass, including the two in areas PR #107 was changing (it has since merged). | "Fix anything that is broken or buggy yeah" | 2026-11-21, Claude project thread "Build a test-and-break loop for the web app", in reply to the list of seven open findings | Fix each, make its live expectation hard where it was soft, rerun. Supersedes D3 for these seven. | Any trust-surface or contract change. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The fake runtime exercises the same claim, log, custody and completion path as a real agent. | `daemon/internal/runner/adapter_fake.go` uses the shared stream base and `CopyFakeOutputs`; only the process differs. | A runtime-specific path in the daemon that the fake adapter skips. |
| A software passkey answering through the page's `navigator.credentials` is checked by the server exactly as hardware is. | `services/api/src/auth.ts` verifies challenge, origin, RP ID, signature, counter and the packed attestation against `trust-anchors`. | A server check that depends on the authenticator's transport or a platform attestation format. |
| The control plane writes a fresh `daemon.token` on every start. | `services/api/src/server.ts`. | A change that stores the token elsewhere. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

The three suites run against the real stack on Chromium with evidence retained here, the loop tooling works end to end (run, merge, next, set), each fix has a test that failed before it, and the owner has made the merge decision. Nothing here claims Firefox or WebKit results (their browsers could not be downloaded in this environment), or that the persona judge's opinions are right.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
