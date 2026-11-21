# Risk: agent panel (click-to-talk slice S1)

- **Mode:** Standard
- Execution owner: Claude Code under the owner's 2026-11-21 instruction to build the click-to-talk design ("make sure we're building all of this").
- Decision owner: Ben Huffer. No protected surface is touched: no kernel decision function, policy, red-team fixture, workflow or spec change. The API is unchanged; the panel uses the existing package view, run events and stop routes.
- Scope: `apps/web/src/components/AgentPanel.tsx` and its test, `apps/web/src/features/case/StoryLine.tsx` (moved from `CasePage.tsx`), `BoardReviewDrawer.tsx`, `AgentCard.tsx`, `styles.css`, `apps/web/e2e/board-looks.spec.ts`, and this packet.

| ID | Risk | Control | Stop condition |
|---|---|---|---|
| R-01 | The panel suggests an agent can be steered or talked to. | The footer says the run took one prompt and cannot be steered, and points to Return; there is no input field; tested. | Any text field or send action in the panel. |
| R-02 | The transcript shows something the record does not hold. | Lines come only from `story()` over the run's recorded events, the same function the case page uses; a failed read says so and points to the raw log. | A line not derived from a recorded event. |
| R-03 | The panel follows the wrong run. | `pickRun`: the run asked for, else the newest live run, else the newest run; unit tested. The office passes its figure's run id. | A board card showing a finished run while a live one exists. |
| R-04 | Two Stop buttons on the office card. | The office card keeps its own Stop and passes `showStop={false}`; tested. | Two Stop buttons for one run. |
| R-05 | A long run floods the page or the screen reader. | The panel shows the latest 200 steps and links to the full case; the log region is `aria-live="polite"` only while live and not paused. | Unbounded growth in the panel. |
| R-06 | The panel breaks accessibility in a look. | The board axe spec opens the drawer on a running card and scans in looks a, b and c. It found two issues, both fixed: list items under a `role="log"` list, and the drawer's Close button (an earlier issue never scanned because the drawer was never opened in the spec). | An axe violation with the panel open. |

## Selected mode

- **Mode:** Standard
- Basis: a user-visible view on the home screen; no contract or protected surface changes.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Slice S1 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the agent panel open, and the owner has made the merge decision. Nothing here claims that any agent can be talked to: controlled runs stay one prompt (ADR 0020), and the panel says so. No session, message channel or Exploration is added.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
