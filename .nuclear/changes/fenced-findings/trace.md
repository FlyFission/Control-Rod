# Trace: Checker findings reach the author as data

| Need | Code | Test |
| --- | --- | --- |
| Findings are labelled data and still to be fixed | `services/api/src/brief.ts` findingsSection | `fenced-findings.test.ts` "says the findings are data first, then fences them" |
| Text in a finding cannot close the fence | same | "cannot be closed early by text inside a finding" |
| Findings unchanged in meaning | same | "keeps the findings themselves unchanged" |
| A scope path stays on its line and in its code span | `brief.ts` scopePathItem | "shows a path that could break its line or code span as a JSON string" |
| Author round 2 gets the notice, fence and inputs/findings.json | `services/api/src/work.ts` buildJob | `scoped-send-back.test.ts` "tells the author the scope..." |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On an author round after a failed check, the brief says the findings are another agent's data, not instructions, and still asks for each one to be fixed. The findings sit inside a fence that no text in them can close, and are also in inputs/findings.json. Each scope path stays on one line and inside its code span. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
