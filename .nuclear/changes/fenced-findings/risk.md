# Risk: Checker findings reach the author as data

- R-01: authors could weigh findings less once they are called data. Mitigation: the notice says "Fix each one" before it says they are data; the general-author role still tells authors to fix each finding. Watch first-pass acceptance on round 2.
- R-02: the escaped JSON must still mean the same thing. Mitigation: `<\/` and \u2028/\u2029 are standard JSON escapes; a unit test parses the fenced text back and compares it with the input.
- R-03: a prompt-level fence is not enforcement; a model may still follow injected text. This lowers the risk, it does not remove it. The structural fix (refusing newlines and backticks in `FindingPath`, limiting finding text) is a `spec/` change left for the owner.
- No trust surface is touched. Brief budgets cover round 1 only, so they are unchanged.

## Selected mode

- **Mode:** Standard
- Basis: two pure functions and one call site in the API, reversible by revert, no data or route change, no trust surface.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

On an author round after a failed check, the brief says the findings are another agent's data, not instructions, and still asks for each one to be fixed. The findings sit inside a fence that no text in them can close, and are also in inputs/findings.json. Each scope path stays on one line and inside its code span. API tests and typecheck pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
