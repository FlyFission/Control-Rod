# Plan: control room redesign

The full plan is `docs/superpowers/specs/2026-11-24-control-room-redesign.md`. Steps, from its section 9:

0. Key frames and art route; owner picks a direction.
1. Instrument components and a Plant vertical slice; owner looks.
2. Rest of the Plant; owner looks.
3. Shell and Board.
4. Today and Inbox.
5. Sign in, Setup and roster.
6. Translation review by Antigravity and Codex against the plan.


## Steps 4 and 5: Today, Inbox, Sign in, Setup, roster (calls made)

- Today reads `api.officeFigures(false)` and `api.inbox()` beside packages and active runs. The needs-you list is the Inbox's own list (riskiest first, at most five, then a link); drafts and in-verification packages the Inbox does not already cover sit under a quieter "In review". A failed read shows a dash and says which read failed, never zero.
- Inbox no longer opens the review drawer by itself. The drawer is now the docked cockpit (about 1060 px at 1440) and covered the list; it opens from "Inspect and sign". Tests that asserted auto-open were rewritten to assert this rule.
- The signing readout (package, bound revision, short and full digest) lives in `DecisionBar`, so the Inbox drawer, the case page and any other host show it above the decision buttons. The drawer's own footer line was left to step 3.
- Risk band: height and glyph from the server's risk rank (`lib/today.ts riskBand`); the Inbox no longer draws a second state mark beside it.
- Sign in: raster plant at night (`base-1440.webp`, 2400 px at 2x), dimmed, behind a notched bezel panel; four states are `data-mode` (register, sign-in, invitation) plus `data-state="error"`. On a phone the panel sits at the bottom so the core shows above it.
- Setup and roster share `AgentList`, now seats (icon lamp, status, switch). Setup lights seats once as found (off under reduced motion or a hidden tab). The roster adds runs this window per runtime from `/usage` telemetry and the tightest organization budget once, above the seats; no per-agent budget.
- `InstrumentFrame` was redrawn with `::before/::after` plates instead of `clip-path` on the element, because the clip cut off its own engraved label.
- Old `.signin*` and `.today-*` rules remain in `styles.css` (not mine to edit while step 3 is in it); the new `pages/screens.css` overrides them. Remove them after step 3 lands.
- Not done here: `AgentFigure.runtime` (needs spec sign-off), the Shell changes the Inbox cockpit may want.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
