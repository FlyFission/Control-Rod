# Break loop: one pass

You are one pass of a loop that tests Control Rod's web app the way people use it and tries to break it, then fixes what it finds. The same prompt runs again after you finish, with a fresh context. Everything you need to know about earlier passes is in the ledger and in git history, not in your memory.

Read first, by section: `AGENTS.md` (rules), `apps/web/e2e/live/README.md` (the suites), and the change record `.nuclear/changes/web-break-loop/` (scope and stop rules).

## Do this, in order

1. **Run the live suites.** `pnpm -C apps/web exec playwright test -c playwright.live.config.ts --trace off` (add `--project=chromium` if `BREAK_LOOP_BROWSERS=chromium`). Then `node tools/break-loop/findings.mjs merge` and note its exit code: 0 means this pass found nothing new.
2. **Judge the journeys.** Follow `tools/break-loop/JUDGE.md` for every journey under `apps/web/test-results/live-journeys/`. Add each judged problem with `findings.mjs`'s JSON shape to `apps/web/test-results/live-findings/judge-<persona>.json` and merge again.
3. **Pick one finding.** `node tools/break-loop/findings.mjs next` prints the worst open one. If it is outside what you may change (below), mark it `owner` with a one-line reason and take the next.
4. **Write the failing test first** if the finding has none: a live test in `apps/web/e2e/live/` that fails for the reason in the finding, or a unit test beside the code. Run it and see it fail.
5. **Fix it**, smallest change that makes the test pass without weakening any other test. Re-run only the failing test while you work, then the live suite for that browser once.
6. **Record it.** `findings.mjs set <key> fixed "<what changed>"`, add a line to the change record's `trace.md`, commit with a message that names the finding. One finding per commit.
7. **Stop or continue.** If step 1 exited 0 and `findings.mjs next` prints nothing you may fix, write `STOP` (one line: why) to `tools/break-loop/.state/STOP` and end. Otherwise end the pass; the loop starts the next one.

## Never

- Edit trust surfaces: any path in `.github/CODEOWNERS` (`policies/`, `tests/redteam/`, `.github/`, `spec/`, `kernel/`, `services/api/kernel/`, `docs/adr/`, `daemon/internal/runner/`, `scripts/`, `packages/check-action/action.yml`, `services/api/src/auth.ts`). A finding there is marked `owner`.
- Skip, delete, loosen or `test.fixme` a test to make a pass green. A test that is wrong is fixed in its own commit that says why.
- Change the API's refusal rules, signing, data-lane or custody behavior to make a test pass. Those findings are `owner`.
- Type an engineering number yourself (AGENTS.md rule 5).
- Push to a branch other than the loop's branch, or merge anything.

## What a good fix looks like

The person is told what happened in plain words and what to do next; nothing is lost or doubled; the screen never claims a state the record does not show. Match the voice of the existing copy (`apps/web/src/lib/` and the components around the change).
