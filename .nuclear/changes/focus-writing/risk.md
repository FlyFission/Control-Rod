# Risk: Agents write so a person can act at a glance

- Every brief grows by about 450 tokens. Small beside a run's inputs; the budgets record it.
- An agent might read "keep lists to five" as leave things out. The section says twice that nothing the work needs is dropped, and the role's required sections stay where it asks.
- Standard restores each agent's own style with one choice; older code ignores the stored field.
- No trust surface is touched beyond an additive, optional spec field.

## Selected mode

- **Mode:** Standard
- Basis: brief text and a stored preference, reversible by revert.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

Under the Focus writing preference, which is the default, every intake, author and pre-check brief carries one section, placed just before the rules, that tells the agent to write what a person reads with the outcome or next action first, numbered steps, one next step at the end, short lists and no preamble, without dropping anything the work needs. Setup has a "How should agents write to you?" choice (Focus or Standard) that is saved like the check-in answer and stays off the chain. Standard leaves the section out. The brief budgets are measured again by script. API and web tests pass.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Pattern source: i-have-adhd by Ayoub Ghriss at `f3e783bae5f4820416492091b3abeb670616c23a` (MIT, `docs/third-party/i-have-adhd-LICENSE`): its ten output rules and its first-and-last-line check, rewritten for agents on a card. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
