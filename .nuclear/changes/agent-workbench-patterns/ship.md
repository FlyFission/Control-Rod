# Ship: agent workbench pattern note

Release decision: **for owner review; no merge is authorized by this record.**

**Merge condition (`docs/patterns/README.md`):** before merge, a person who did not write `docs/patterns/agent-workbenches.md` compares it with the source documentation for copied wording, and their name, the date and the result are recorded here. The six-word script (E-03) is a pre-check and does not meet this condition.

| Reviewer | Date | Result |
|---|---|---|
| not yet assigned (gap) | deferred | deferred |

- **Proposed:** merge the note and this packet, together with the agent-orchestrator note.
- **Not claimed:** a person's read of the note for copied wording (D3); a script ran instead (E-03), and the person's check is the merge condition above.
- **Found, not fixed:** the Today page counts every `draft` and `in-verification` package as "Needs Your Decision", including work waiting on someone else, so it can disagree with the Inbox and the tab count in #159. Recorded as AW5.
- **Owner decisions requested:** accept the note or return it with changes; confirm D2 and D3; pick the next items (proposed: AW5, then AW7).

Rollback: revert the commit. Nothing reads pattern notes at runtime.

Monitoring after merge: none needed at runtime, since no code reads the note. Watch the build PRs that cite AW items (#159 first) for decisions that disagree with the note, and update the note when they do.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 ship in #159 under its own record (`board-attention`). Before merge, a person who did not write the note checks it against its sources for copied wording, and the result is recorded in [ship](ship.md). No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
