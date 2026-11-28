# Trace: Pull request state on accepted cards

| Need | Code | Test |
| --- | --- | --- |
| Fixed words from gh's answer; unknown checks never count as passing | `pr-watch.ts` watchFromFacts | `pr-watch.test.ts` "maps each pull request state...", "treats a check it does not know as still running..." |
| No GitHub text kept | same | "refuses anything that is not gh's answer, and keeps no text from GitHub" |
| Read at most once while fresh; never after merge; one read shared | PullRequestWatcher | "reads once while fresh...", "answers nothing when the first read fails..." |
| Last good reading survives a failed read | same | "keeps the last good reading when a later read fails..." |
| Package view carries the reading, or nothing when it cannot be read | `work.ts` pullRequestOf | `signing-policy.test.ts` "shows what GitHub says about the opened pull request..." |
| Card line by state | `lib/next.ts` acceptedLine | `next.test.ts` "an accepted card's pull request" |
| Pull request line in words, link kept, time checked | `PullRequestLine.tsx` | `pull-request-line.test.tsx` |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

After Control Rod opens a card's draft pull request, the card's line and the pull request line say whether it is ready to merge, failing its checks, still checking, merged or closed, read live and read-only from GitHub. When GitHub cannot be read, both lines are exactly as before. No text from GitHub is read or shown. API and web tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
