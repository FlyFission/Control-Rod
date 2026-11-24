# Control room redesign

Plan v2, 2026-11-24. Repo checked at `main` `0f6fd54`. Builds against the reference board in [`design/references/`](../../../design/references/README.md) and its per-screen bar in [`screens.md`](../../../design/references/screens.md). Change record: `.nuclear/changes/control-room-redesign/` (opened with step 1).

v1 was graded blind by three reviewers, each against criteria it wrote before reading the plan: Codex gpt-6.2-astra 54.1/100, Claude Fable 5.2 49/100, Antigravity gemini-4-neon-high 42.7/100. Section 13 lists what v2 changed because of them. Every code claim the reviewers raised was checked against `0f6fd54` before it was used.

## 1. Why this plan exists

Three rounds (#153 twice, #165) ended at about the same look. The plant already has art: `build-plant-theme.ts` draws rooms, workstations and operators as procedural SVG (`build-plant-theme.ts:3-6`). The problem is that this art reads as a diagram, not a place, and every round restyled around it. v1 repeated the mistake by rewriting the same script. v2 changes the method:

| Cause | Answer |
|---|---|
| Art made by a coding agent from primitives | Section 4: art is painted by an image model or an illustrator, from an approved key frame, and only assembled by code |
| No target picture | Step 0: Ben approves key frames before any code changes |
| Rules that pinned the old look | Section 5: what may change, including the theme contract, looks and geometry tests |
| Code review as the finish line | Section 10: scripted visual checks, a calibrated visual critic, Ben's yes at step 0, step 1 and merge |

## 2. Goal and measure

Every main screen looks like one coherent, beautiful nuclear control room, and the Plant is something people screenshot and share. Done when every row in the trace table (section 11) passes at 1440 x 900 and 390 x 844, scored by scripted checks where a row is measurable and by a non-building critic otherwise, and Ben says yes.

## 3. Art direction

One world, specific enough that two artists would produce matching work:

- **Era and place:** a present-day Generation III+ plant control room at night shift. Not retro CRT, not sci-fi.
- **Materials:** brushed and powder-coated steel consoles, matte composite panels, smoked glass, backlit engraved legends. Concrete containment with a fine form-tie pattern.
- **Light:** low ambient blue-grey; light comes from instruments and screens; one warm key light from the core. Rooms are dark until occupied.
- **Projection:** one projection everywhere: a 3/4 top-down isometric cutaway (30 degree), walls cut at console height. The site plan is drawn in that projection, not as a flat plan.
- **Palette roles:** base blue-greys (healthy); cyan only for live running things; amber only for "needs you"; red only for stuck and SCRAM. Waiting uses a shape (a pause glyph on a neutral lamp), not a hue. Input changed uses a shape (a diamond mark) on the neutral lamp.
- **Type:** Inter for UI text (already bundled), JetBrains Mono only for readouts (counts, IDs, digests, timers). Scale: 12, 14, 16, 20, 28, 40 px; weights 400, 500, 600. No letter-spaced labels.
- **Signature elements:** the instrument bezel (`InstrumentFrame`: machined corners, a fine rule, an engraved label) and the rod gauge (section 6.6), on every screen.

Reference moves, by element: core as centre of a radial settlement (reference 7); rooms as cutaways with crew at stations that visibly break (5); flow as motion along lines (8); live status as one plain state (1); readouts as machined instruments (3); calm empties (6); dense quiet lists (9).

## 4. Art source and pipeline

**Step 0 decides the route** (section 9). In order of preference:

1. **Image model on Ben's Mac.** Check which image generation Ben's existing accounts provide (Antigravity/Gemini, ChatGPT), and its terms for ownership and commercial use. Use it to paint 3 key frame directions of the Plant at 1440 x 900, then, from the chosen one, each asset below with the key frame as a style reference. A person or agent cleans each asset (crop, colour-match to the palette roles, remove artefacts).
2. **Commissioned illustrator,** if Ben chooses to pay for it, working from the same brief.
3. **No fallback to primitives for hero art.** If neither route reaches the bar after two key frame rounds, stop and ask Ben.

**Asset list** (each a layered WebP at 2x, plus an SVG mask for hit areas): site base at night; containment and core in three states (cold, lit, tripped); 13 rooms in two states (dark, lit), seat positions marked; crew figure poses (seated working, standing waiting, slumped stuck) in 3 sizes; 6 agent icons (Claude, Codex, Antigravity, opencode, Grok, generic) as original glyphs, never vendor logos; instrument textures (bezel, glass, engraved legend); sign-in night backdrop.

**Assembly:** a new `PlantScene` component owned by the application (as `ReactorCore` is today) layers the assets, the live overlays (lamps, flow, figures, labels) and the hit areas. Code draws only overlays, never hero art.

**Rights and provenance:** `design/art/PROVENANCE.md` records, per asset, the route, the tool and model, the prompt or brief, the date, the licence basis and the SHA-256 of the shipped file. `tools/check_art_provenance.py` fails the build when a shipped asset has no row or a wrong digest.

**Budgets:** total Plant art at most 1.5 MB over the wire at 1440, at most 600 kB on phone (smaller variants); 60 fps on a 2020 MacBook Air with 40 agents; measured by a Playwright performance trace.

## 5. What may change and what may not

**May change:**
- Layout and markup of every screen in scope, CSS, and components.
- The Plant layout (`plant-layout.ts`), replaced by the radial layout in section 6.1, with its geometry checks rewritten for the new shape.
- The theme contract: the Plant stops being an `OfficeThemeV1` theme. `PlantScene` is first-party art, so the contract's one-image-per-region, no-filter rule (`contract.ts:35`, `:52-64`) stays in force for the archived office themes only.
- `ReactorCore.tsx`'s hex lattice, replaced by the painted core.
- Looks: Look A becomes the control room. Look C is retired. Look B (light) stays only as a reading-comfort option, restyled to the same palette roles; Ben can retire it too (section 12).
- The 17 released themes and 15 floor packs: removed from the release list and the picker; files kept under an archive path for history.
- Frontend reads: Today and the Board may call existing endpoints they don't call today (`api.officeFigures()`, `api.inbox()`, package runs).
- Tests that assert old geometry, class names or looks are rewritten to assert the new design's rules. None is deleted to get green; a reviewer compares old and new assertions.

**May not change:** API behaviour, apart from the one additive field in 6.7; what each instrument claims (`plant-instruments.ts` rules and its unit tests stay unchanged); routes; keyboard access, focus order and visible focus; contrast; Board columns, ordering and actions; trust surfaces (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions, `kernel/`).

## 6. Plant

### 6.1 Composition

A radial site in the section 3 projection. At 1440 x 900 with the shell visible:
- **Centre:** containment and the painted core, at least 25% of the canvas area and its brightest region (both checked by script, section 10).
- **Inner ring:** main control room (your office), verification, review board, work control.
- **Outer arc:** the six work bays.
- **Outside the fence:** staging yard, records vault, hold yard with its striped barrier.
- Same 13 places; only geometry changes.

### 6.2 Flow (reference 8)

Flow follows work, room to room, derived from figures that share a `package_id`: a bay to verification while a checker runs on that package; verification to the control room when a gate waits on you; any room to the hold yard on quarantine. Pulses move only while the handoff is live. Nothing flows from the core.

### 6.3 Crew (reference 5)

Each agent is a painted figure at a seat, with its agent icon and its package title (truncated to fit, full title on focus). Poses by state: working (seated, screen lit), needs you (standing, amber lamp), waiting (seated, neutral lamp with pause glyph), stuck (slumped, red lamp, station screen cracked, slow flicker), input changed (neutral lamp with diamond mark). Seat counts per room are set so 40 agents fit; above `EXCEPTIONS_AT` (40, `exceptions.ts:12`) the existing folding applies. The target-ring badges are removed.

### 6.4 Annunciator and links

Four windows in an `InstrumentFrame`. Each window's source stays as today (`plant-instruments.ts:77`, `:84`): Waiting on you counts `needs_me` items, so it links to the Inbox and to the rooms holding the viewer's needs-you figures; Stuck and Input changed link to the rooms holding those figures; SCRAM links to the SCRAM banner. The link is always visible at rest as a thin leader line from a lit window to its rooms, not only on hover, and focus follows the same path.

### 6.5 Look-ahead (reference 4)

Two cues, both from recorded data: a checker figure working on a package whose gate waits on you ("check finishing, you're next"), and a budget in state `near` (shown only where the policy sets `budget_near_percent`; otherwise absent, never faked). Both use an amber outline tick, the smallest amber mark, so the needs-you lamp stays the strongest warm object.

### 6.6 Rod gauge and SCRAM

The rod gauge in the top bar shows all five `RodPosition` values (`plant-instruments.ts:127`): withdrawn (no real SCRAM in force; this does not mean work is running), project bank inserted, all inserted, drill (striped), unknown (hatched, "SCRAM status unavailable").

A real SCRAM, within 1 second of the client receiving it (SCRAMs are read on the existing 30 s poll and on pull, `OfficeView.tsx:79`): rods drop on the gauge, the core switches to its tripped asset, flow stops, the shell frame turns red, non-SCRAM actions show as locked, and a new hazard banner (designed here; not dependent on #165) shows. A drill shows a striped DRILL plate and never the trip palette.

### 6.7 One additive API field

`AgentFigure.runtime?: string`, the latest run's runtime provider, so a figure shows its agent icon. Additive in API 0.1, regenerated per AGENTS.md rule 3. If rejected, figures show a role glyph.

### 6.8 Empty, phone, list

- Empty: core cold, rooms dark, no flow; one line: "No agents running. Start work from the Board."
- Phone: below 1024 px, `OfficeView` no longer drops the scene (`OfficeView.tsx:56`, `:134`). It shows, in order: a compact core showing the working count, the annunciator as a 2 x 2 grid, then the zone list. No horizontal scroll; touch targets at least 44 px.
- The list (`PlantList.tsx`) stays the accessible equivalent; the painted scene is `aria-hidden`.

## 7. Shell and Board

**Shell:** rail and top bar redrawn in the instrument vocabulary; rod gauge in the top bar; project switcher and New change reachable at every width.

**Board (behaviour unchanged):**
1. Cards: title carries hierarchy; one muted metadata line; one accent.
2. Running cards: a live status line built from the run's latest event summary and elapsed time (for example "Writing tests, 12 min"), replacing the static "An agent is working on it" (`lib/next.ts:82`); data from package runs, which the card does not receive today (`Card.tsx:34-68`), so `useBoardData` adds the latest run per card.
3. Cards waiting on you are the only amber cards.
4. Author and checker agent icons from the runs' runtime providers.
5. Designed empty state with one action.
6. **Drawer as cockpit:** replace the three tabs (`BoardReviewDrawer.tsx:110`) with one layout at 1440 x 900: status header; left, the run log; right, the outputs preview (patch outputs shown by the existing preview); bottom, the decision bar, always visible. Below 1024 px it falls back to stacked sections. A dedicated side-by-side diff view is out of scope (no diff renderer exists today); the row is marked deferred in section 11.
7. Phone: a single-column list grouped by column with sticky column headers.

## 8. Today, Inbox, Sign in, Setup, roster

- **Today:** reads `api.officeFigures()` and `api.inbox()` in addition to packages (`Today.tsx:10-17` reads packages only). A shift brief in an `InstrumentFrame`: one headline sentence, three readouts (needs you, running, stuck), then the needs-you list, all above the fold at 1440 x 900. A calm finished state when nothing needs you.
- **Inbox:** a risk band at each item's left edge (order unchanged); signing shows the bound revision and digest as an instrument readout above the decision buttons; a designed calm empty state.
- **Sign in:** the night site backdrop from the art set, dimmed, behind a bezel-framed panel.
- **Setup:** detected agents appear as seats at a table that light up as found; then the existing three-way confirm.
- **Agents roster:** seats with icon, name, status and toggle. "Usage left" is deferred: no usage data exists per agent; the row is marked deferred.
- Phone layouts for each, in the same step as the desktop layout.

## 9. Steps

Each step ends with screenshots, scripted checks and the critic (section 10). Steps 0 and 1 end with Ben's yes.

0. **Key frames (no code).** Settle the art route (section 4). Produce 3 directions of the Plant (healthy, needs-you, SCRAM) at 1440 and 390, plus one quiet Today frame. Ben picks one or kills the route.
1. **Vertical slice.** Open the change record. `PlantScene` with the chosen core, two rooms, crew poses, live state, flow, hit areas and phone layout, on real fixtures (cold, busy 40, SCRAM, drill). Ben looks before the rest is built.
2. **Rest of the Plant.** All 13 rooms, annunciator links, look-ahead, rod gauge, hazard banner, retirement of the old plant theme, looks and theme packs.
3. **Shell and Board.**
4. **Today and Inbox.**
5. **Sign in, Setup, roster.**
6. **Translation review** by Antigravity and Codex against this plan, item by item.

Builders are Sonnet subagents, one per step or sub-step, with Claude orchestrating; steps 3 to 5 can run in parallel after step 2.

## 10. Verification

- **Fixtures and harness:** `apps/web/e2e/visual-bar.spec.ts` renders every row of section 11 from deterministic fixtures at 1440 x 900 and 390 x 844, plus a 200 px thumbnail of empty and busy.
- **Scripted checks:** core area share at least 25% and brightest mean luminance; warm-pixel share in the healthy fixture under 0.5% of the canvas; empty versus busy 200 px thumbnails differ by a set perceptual distance; no animation running under reduced motion or in a hidden tab; no horizontal scroll at 390; axe (`@axe-core/playwright`) with no serious or critical issues; existing contrast tests extended to every token pair the new CSS uses.
- **Critic:** after each step, a model that did not build it grades screenshots row by row, pass or fail with a reason. Before first use it grades a calibration set (the #153 and #165 screenshots as known fails, the approved key frames as the target) and must fail the known fails.
- **Before and after:** each row's screenshot sits next to the main baseline and the approved key frame.
- **Relapse check:** a test fails if hero art (core, rooms, figures) is drawn from TSX or CSS primitives instead of art assets.
- **Code checks:** typecheck, unit tests (with `plant-instruments` tests unchanged), originality, art provenance, change record validation.

## 11. Trace to `screens.md`

| Screen | Row | Plan |
|---|---|---|
| Whole app | Recognisable crop | 3 (signature elements), 7 (shell) |
| Whole app | Healthy is near-monochrome | 3 (palette roles), 10 (warm-pixel check) |
| Whole app | Needs-you is the only warm object | 3, 6.5, 7.3 |
| Whole app | Motion means running or changing | 6.2, 10 |
| Whole app | Hierarchy from type | 3 (type) |
| Plant | 5-second read | 6.3, 6.4 |
| Plant | Core 25%, brightest, rooms around | 6.1, 10 |
| Plant | Illustrated rooms | 4, 6.1 |
| Plant | Empty differs at 200 px | 6.8, 10 |
| Plant | 40 agents as figures with icon and title | 6.3, 6.7 |
| Plant | Flow as motion along lines | 6.2 |
| Plant | Needs-you room lights, linked to annunciator | 6.3, 6.4 |
| Plant | About to need you | 6.5 |
| Plant | Stuck looks broken | 6.3 |
| Plant | SCRAM full screen within 1 s | 6.6 |
| Plant | Drill | 6.6 |
| Plant | Phone | 6.8 |
| Board | Empty | 7.5 |
| Board | Dense and quiet | 7.1 |
| Board | Running status line | 7.2 |
| Board | Waiting on you amber, first | 7.3 (order already attention-first) |
| Board | Agent icons | 7.4 |
| Board | Drawer cockpit | 7.6; diff deferred (no renderer) |
| Today | Shift brief above the fold | 8 |
| Today | Calm finished state | 8 |
| Inbox | Risk band | 8 |
| Inbox | Weighty signing | 8 |
| Inbox | Calm empty | 8 |
| Sign in | Night plant mood | 4, 8 |
| Setup | Seats light up | 8 |
| Roster | Seats with toggles | 8; usage left deferred (no data) |

## 12. Decisions for Ben

1. Art route after step 0 (image model on his accounts, or a paid illustrator).
2. Keep Look B (light) as a reading-comfort option, or retire it. Default: keep it.
3. The additive `AgentFigure.runtime` field. Default: add it.

## 13. What the v1 reviews changed

- Art: from a rewritten primitive script to painted assets from approved key frames, with provenance and a relapse check (all three reviewers).
- Order: key frames and a vertical slice first, with Ben's yes, instead of tokens first (all three).
- Contract, looks and themes: each now has a decided fate (Fable, Antigravity).
- Flow: room to room from shared packages, not core to rooms (Antigravity, Fable).
- Phone: core first, and the scene no longer drops below 1024 px (all three).
- Hues: waiting and input changed use shapes, not violet or extra amber (Fable, Antigravity).
- Rod gauge: all five positions; withdrawn does not mean running (Codex, Fable).
- SCRAM: 1 second from receipt, not from the remote pull; own hazard banner, not #165's (Codex, Fable, Antigravity).
- Annunciator: each window's real source and its link target (Codex).
- Board and Today: the data each needs, from existing endpoints (Antigravity).
- Measurable rows scripted; critic calibrated; axe added; budgets set (Fable, Antigravity, Codex).
- Diff view and roster usage marked deferred with reasons (Antigravity).
- Factual fixes: the live plant is three bands, not two rows; the contrast script checks a fixed matrix; the existing art is procedural vector, not absent.
