# Live suites: test the real app, then try to break it

These suites run the whole of Control Rod, not fixtures: the built control plane with its embedded PostgreSQL in a throwaway home, the Go run daemon offering only the scripted fake runtime (`tests/e2e/fake/`), and the web app's release build. A software passkey stands in for the hardware key in Chromium, Firefox and WebKit alike; the server still verifies every registration, sign-in and signature, including the packed attestation chain. Nothing else is simulated.

| Pass | File | Tag | What it does |
|---|---|---|---|
| Functional | `lifecycle.spec.ts` | `@functional` | One request from a typed line to an accepted package: capture, lane, intake, release, author run, pre-check override, pre-check, accept. Screenshot and axe WCAG 2.2 AA scan at every stop. |
| Break it | `break.spec.ts` | `@break` | Hostile and odd input, double clicks, a stale second tab, the network dropping, the control plane restarting, the daemon killed mid-run, an author that writes markup and a symlink, a lost session, a dead link. |
| Persona | `personas.spec.ts` | `@persona` | A new user with no agents, someone juggling eight runs, a keyboard-only person, a phone. Each writes a journey for the judge (`tools/break-loop/JUDGE.md`). |

## Run

```sh
pnpm -C apps/web exec playwright test -c playwright.live.config.ts --trace off              # all, three browsers
pnpm -C apps/web exec playwright test -c playwright.live.config.ts --project=chromium --grep @break
```

The global setup builds the spec package, the API, the web app and the daemon; set `LIVE_SKIP_BUILD=1` when nothing changed. Other knobs (see `stack.ts`): `LIVE_DAEMON_BIN` (a built `controlrod`), `LIVE_RUN_AS` (a user to run the stack as when the suite runs as root, since the embedded database refuses root), `LIVE_KEEP=1` (keep each stack's home and logs), `LIVE_CHROMIUM_PATH` (a preinstalled Chromium of another version). Install browsers once with `pnpm -C apps/web exec playwright install --with-deps chromium firefox webkit`.

A full run on one browser takes about six minutes; the daemon test alone waits out the 90 second run lease.

## Findings and the loop

Every failed expectation, every axe violation, every uncaught page error, every 5xx and every response slower than three seconds is written as a finding to `apps/web/test-results/live-findings/`. `node tools/break-loop/findings.mjs merge` folds a run into the committed ledger (`ledger.json` here) and exits 10 when anything is new. `tools/break-loop/loop.sh` runs `tools/break-loop/PROMPT.md` again and again with a fresh agent: each pass runs the suites, judges the journeys, fixes the worst open finding test first, and stops when a pass finds nothing new and nothing fixable is open. Trust surfaces are never touched by the loop; findings there are marked `owner`.

Hard expectations (`expect`) guard what must never happen: script from input or agent output running, a decision recorded twice, work lost or doubled, the server failing on input. Soft expectations (`expect.soft`) state what a person should be told; they let the test continue so one run finds every gap.

## Writing a test here

Find things by role and visible words, as a person or a screen reader would. Tests share one stack per worker, so make your own packages (`draftPair`) and count by a unique tag, never by totals. Wait on the real system with `expect.poll` against the API, not on timers. When a test kills or restarts part of the stack, restore it in `finally`.
