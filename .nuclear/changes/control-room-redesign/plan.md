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

## Step 3: Shell and Board (calls made)

- Drawer docking: the cockpit is a fixed panel on the right, below the top bar and any SCRAM banner (`--dock-top`, measured from `#main`), up to 1060 px wide, so the SCRAM button and rod gauge are never covered. The Board stays put on its left but is narrow behind it at 1440; the old 420 px split could not hold two columns. Below 1024 px it is full width and stacked; at 820 px and below it is full screen under the top bar line (top 0), over the bottom bar. The capture drawer keeps its old split.
- Strip: status strip is an `InstrumentFrame` labelled Status (a readout, not a card). Criteria, design basis/scope and pre-check open one shared details region on demand, so the strip stays compact. The switches' explanatory notes stay visible at chip size.
- Decision bar: the existing `DecisionBar` is unchanged; the cockpit only restyles it into one band at the foot (readout, sentence, buttons) and drops the duplicate lane/digest line. It lives outside the scrolling body, so it never scrolls away.
- Outputs: the diff or patch is chosen first and drawn at once; other outputs are one click away. `previewKind` gains "diff", so the Full case page gets the unified diff too. Added lines carry a lit tint and "+", removed lines a hatched tint and a minus sign, so neither relies on colour; red and green are not used (palette: red only for stuck). A patch over 1500 lines draws in part with "Show all".
- Running line: `nextLine` now takes the run's label ("Writing tests") or "Author running" (or "Author queued" while only queued); the card adds elapsed time from `started_at` (redrawn each 30 s, paused in a hidden tab) and a 2 px indeterminate cue, static under reduced motion. A running line shows a lit dot, not "Waiting". `lib/next.test.ts` assertion for the old static text changed to the new fallback.
- Card: title first, one muted metadata line, amber only for cards waiting on you, red edge for blocked. Kind word folds to its icon below 250 px card width. Author and checker icons use `AgentBadge` from the latest author and pre-check runs' providers; the initials avatar remains the fallback when no run is recorded.
- Shell: rail and top bar restyled in `components/shell.css` (new file, so concurrent edits to `styles.css` cannot collide). Top bar grows to 72 px to hold the full-size 18 x 56 rod gauge on an engraved plate. Phone is decided in JS (`useMedia`, 820 px): no rail; top bar carries brand, project switcher (a select), New change, rod gauge and SCRAM; bottom bar has Board, Plant, Inbox, Today, More; More is a modal sheet with the other places, search, runs, mode and sign out. On jsdom (no `matchMedia`) the desktop shell renders, so existing tests are unchanged.
- Phone Board: one column grouped by stage, stage headers sticky under the top bar (`--phone-top-h` published by the shell).
- Not done: a pointer-free keyboard shortcut to jump between stages on the phone list; the Board's own header controls were not restyled beyond tokens.

## Required links

[Risk](risk.md), [basis](basis.md), [plan](plan.md), [proof](proof.md).

## Exit criteria

As in [basis](basis.md#exit-criteria).

## Source-lineage note

Local engineering evidence using the repository workflow, not a compliance certification. Workflow source map: https://github.com/FlyFission/nuclear-grade-context-engineering/blob/main/docs/00-standards-foundation/source-map.md.
