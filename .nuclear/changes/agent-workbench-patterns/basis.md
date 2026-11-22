# Basis: agent workbench patterns and attention signals

**Change slug:** `agent-workbench-patterns`
**Related risk record:** `risk.md`
**Owner:** Ben Huffer
**Date:** 2026-11-22
**Decision this basis supports:** whether `docs/patterns/agent-workbenches.md` is accepted as design input, and whether its first four items (AW1 to AW4) may ship in the web app.

## Mission / need

The owner works daily in the Claude Code desktop app and Orchestrator.inc, rates Vibe Kanban and Paradev highly, and asked for Control Rod to reach the same standard. Control Rod is itself an agent workbench, so the request is read as one about the product. All four tools first answer "which of my agents needs me now?", and signal it outside the window. Control Rod answered that only inside the tab (the Inbox badge, the board's Needs you count). Its gap analysis already lists the missing pieces as G-05 (nothing reaches you outside the tab) and G-12 (keyboard travel is partial).

## Scope

In scope: the pattern note and its line in `docs/patterns/README.md`; in `apps/web`, the tab title count (AW1), opt-in browser notifications for new Inbox items (AW2), the `N` key on the board (AW3) and the `?` shortcut list (AW4); tests; this record. Out of scope: any API, spec, kernel, policy, red-team or workflow change; items AW5 to AW19, each of which needs its own record.

## Owner decisions (fixed inputs)

| # | Decision | Owner's words | Given | Reading | Out of scope |
|---|---|---|---|---|---|
| D1 | Bring Control Rod up to the standard of the agent workbenches the owner uses. | "I've really been enjoying the claude projects view and this orchestrator.inc workflow.  Please align our repo with similar excellence.  Vibe Kanban and Paradev are also excellent." | 2026-11-22, Orchestrator.inc worker session control-rod-16, the opening request | Study the four tools, record what to take as a pattern note with a decision per item, and build the items that touch no trust surface. | Any trust-surface change; copying code or wording; building items that carry a gate. |
| D2 | Build AW1 to AW4 now and leave AW5 to AW19 for later records. | none: authoring agent's choice, open to the owner | 2026-11-22, same session | AW1 to AW4 are web-only, reversible, and close gaps already ranked (G-05 first step, G-12). | Which later items to start. |
| D3 | Run the copied-wording check by script, not by a second person. | none: authoring agent's choice, open to the owner | 2026-11-22, same session | A six-word overlap check against every source text that was read and kept; matches reworded. | A person's read of the note. |

## Assumptions and invalidation triggers

| Assumption | Basis | Invalidation trigger |
|---|---|---|
| The three open-source projects are permissively licensed at the pins, so the clean-room split is not required. | GitHub license metadata: Paradev MIT, Vibe Kanban Apache-2.0, Orchestrator.inc Apache-2.0. | A file to be ported carries another license. |
| The Claude Code desktop app is proprietary; only its public documentation was read, and only ideas are taken from it. | Anthropic product; docs page read 2026-11-22. | Any port of its code, assets or wording. |
| Notifications from the page (`new Notification`) work in desktop Chromium, Firefox and Safari while the tab is open. | Browser platform behavior; not run in a real browser in this change. | A browser that throws; the hook catches it and the title count still shows. |

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [trace](trace.md), [verification](verification.md), [ship](ship.md).

## Exit criteria

`docs/patterns/agent-workbenches.md` gives a decision for each item AW1 to AW19. AW1 to AW4 work in the web app: the tab title counts the viewer's own Inbox items only after a successful read; browser notifications are off until the person turns them on and then fire only for new Inbox items while the tab is hidden; `N` on the board moves to the next card marked Needs you or Blocked; `?` opens the shortcut list. The web typecheck and the full web test suite pass. No trust surface is touched.

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
