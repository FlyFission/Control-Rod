# Plan: agent panel (click-to-talk slice S1)

1. Move `StoryLine` and `allRunEvents` from `CasePage.tsx` to `features/case/StoryLine.tsx` so the case page and the panel share them.
2. `components/AgentPanel.tsx`: `pickRun(runs, runId?)`; a header with state, role, round, runtime and vendor badge; a terminal-style transcript of the latest 200 story steps in a `role="log"` region, polled every 2 s while live and visible; Pause and Resume with a count of what arrived; Stop when `canStop`; a footer saying the run cannot be steered and that a Return direction goes to the next run.
3. Board: the review drawer shows an Agent section with the panel when the package has runs.
4. Office: the agent card shows the panel for its figure's run, with Stop left to the card's own actions.
5. Review fixes: polling asks only for events after the last one held (`allRunEvents` takes a start sequence); Pause holds a snapshot of the steps; Resume stays while paused after the run ends.
6. Tests: `components/agent-panel.test.tsx` (15), the full web suite, typecheck, and the board axe spec extended to open the drawer on a running card in each look.

Interfaces as built: `pickRun(runs: readonly Run[], runId?: string): Run | undefined`; `<AgentPanel packageId runId? showStop? />`; `PANEL_STEPS = 200`.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md). Design record: [board-redesign](../board-redesign/basis.md). Design doc: "Click-to-talk terminal for board agents" (claude.ai artifact, linked from the pull request).

## Exit criteria

Slice S1 is implemented with its tests and evidence retained in this packet, the board axe scan is clean in all three looks with the agent panel open, and the owner has made the merge decision. Nothing here claims that any agent can be talked to: controlled runs stay one prompt (ADR 0020), and the panel says so. No session, message channel or Exploration is added.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
