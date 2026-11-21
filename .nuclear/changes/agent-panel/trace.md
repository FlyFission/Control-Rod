# Trace: agent panel (click-to-talk slice S1)

| ID | Requirement | Tests | Disposition |
|---|---|---|---|
| T-01 | The panel follows the run asked for, else the newest live run, else the newest run. | `agent-panel.test.tsx` "pickRun" (5 cases) | implemented and tested |
| T-02 | The live run's recorded events show as a transcript, with tool results marked. | "shows the live run's transcript from its recorded events" | implemented and tested |
| T-03 | The panel says a controlled run cannot be steered and offers Stop on a live run. | "says plainly that a controlled run cannot be steered…" | implemented and tested |
| T-04 | The office card's panel has no second Stop. | "leaves Stop to the caller when asked to" | implemented and tested |
| T-05 | A finished run offers no Stop and no Pause. | "offers no Stop on a finished run" | implemented and tested |
| T-06 | A card with no runs says so. | "says when no agent has run on the card" | implemented and tested |
| T-07 | A long run shows the latest 200 steps and says how many there are. | "shows only the latest steps of a long run and says so" | implemented and tested |
| T-08 | Pause holds what is shown and counts what arrived; Resume shows it. | "holds what is shown while paused and counts what arrived" | implemented and tested |
| T-09 | The case page's run story is unchanged after the move. | `features/case/case.test.tsx` (existing) | tested |
| T-10 | The board stays axe clean in looks a, b and c with the drawer and panel open. | `e2e/board-looks.spec.ts` "the review drawer's agent panel has no axe violations" | implemented; run on Chromium (E-02) |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Slice S1 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the agent panel open, and the owner has made the merge decision. Nothing here claims that any agent can be talked to: controlled runs stay one prompt (ADR 0020), and the panel says so. No session, message channel or Exploration is added.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
