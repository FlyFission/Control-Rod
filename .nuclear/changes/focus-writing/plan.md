# Plan: Agents write so a person can act at a glance

1. Read the upstream repository and its licence (MIT); adapt the rules rather than copy the file.
2. Add the brief section and the Setup preference; additive spec change, regenerated.
3. Re-measure the brief budgets; update the byte-for-byte brief tests to expect the section.
4. API and web tests; draft PR; merge on green under the owner's standing yes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Under the Focus writing preference, which is the default, every intake, author and pre-check brief carries one section, placed just before the rules, that tells the agent to write what a person reads with the outcome or next action first, numbered steps, one next step at the end, short lists and no preamble, without dropping anything the work needs. Setup has a "How should agents write to you?" choice (Focus or Standard) that is saved like the check-in answer and stays off the chain. Standard leaves the section out. The brief budgets are measured again by script. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): its ten output rules and its first-and-last-line check, rewritten for agents on a card. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
