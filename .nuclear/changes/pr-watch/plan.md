# Plan: Pull request state on accepted cards

1. Spec field, regenerate.
2. Read, mapping and cache, with unit tests (`test/pr-watch.test.ts`) against a scripted reader and clock.
3. The package view carries the reading. An integration test in `test/signing-policy.test.ts` shows a reading, one read for two views, and no reading after a failure.
4. Card line and pull request line, with tests (`lib/next.test.ts`, `components/pull-request-line.test.tsx`).
5. Typecheck API and web, run the related suites, open a draft PR, Codex review (at most two rounds), and merge on green under the owner's merge-on-green permission (to 2026-12-02).

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

After Control Rod opens a card's draft pull request, the card's line and the pull request line say whether it is ready to merge, failing its checks, still checking, merged or closed, read live and read-only from GitHub. When GitHub cannot be read, both lines are exactly as before. No text from GitHub is read or shown. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
