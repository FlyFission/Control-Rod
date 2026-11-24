# Control room redesign

Plan v3.1, 2026-11-24. Repo checked at `main` `0f6fd54`. Builds against the reference board in [`design/references/`](../../../design/references/README.md) and its per-screen bar in [`screens.md`](../../../design/references/screens.md). Change record: `.nuclear/changes/control-room-redesign/` (opened with this plan, before step 0).

Graded blind by three reviewers, each against criteria it wrote before reading any version: v1 scored Codex gpt-6.2-astra 54.1, Claude Fable 5.2 49, Antigravity gemini-4-neon-high 42.7 (out of 100); v2 scored 58.7, 68.6 and 58.5; v3 scored 65.4, 70.6 and 69.1. v3.1 corrects the factual errors round 3 found, without another round (the owner allowed one or two iterations). Section 13 lists what each round changed. Every code claim a reviewer raised was checked against `0f6fd54` before it was used.

## 1. Why this plan exists

Three rounds (#153 twice, then the unmerged #165) ended at about the same look. The plant already has art: `build-plant-theme.ts` draws rooms, workstations and operators as procedural SVG (`build-plant-theme.ts:3-6`). The problem is that this art reads as a diagram, not a place, and every round restyled around it. v1 repeated the mistake by rewriting the same script. This plan changes the method:

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
- **Light:** low ambient blue-grey; light comes from instruments and screens; the lit core is a cold white-cyan key light (Cherenkov blue), never warm. Rooms are dark until occupied. Amber and red appear only as state lamps.
- **Cool factor:** the Cherenkov glow of the core seen from above through the containment cutaway, the plant dark at night with rooms lighting up as agents start work, and a SCRAM that visibly drops the rods and kills the glow.
- **Projection:** one projection everywhere: a 3/4 top-down isometric cutaway (30 degree), walls cut at console height. The site plan is drawn in that projection, not as a flat plan.
- **Palette roles** (hex values fixed in `design/art/style.md` at step 0, from the approved key frame): base blue-greys (healthy); cyan only for live running things; amber only for "needs you"; red only for stuck and SCRAM. Waiting uses a shape (a pause glyph on a neutral lamp), not a hue. Input changed uses a shape (a diamond mark) on the neutral lamp.
- **Type:** Inter for UI text and JetBrains Mono only for readouts (counts, IDs, digests, timers); both are already bundled (`apps/web/public/fonts`). The existing `--fs-*` tokens stay and keep `type-scale.test.ts` green (smallest step at least 11 px, ascending, default letter spacing); display sizes 20, 28 and 40 px are added above them as letter-only names (`--fs-title`, `--fs-headline`, `--fs-display`, matching the test's `^var\(--fs-[a-z]+\)$`), and every new CSS file is added to the test's file list (`type-scale.test.ts:50`). Weights 400, 500, 600.
- **Signature elements**, on every screen, each a dimensioned component built in step 1:
  - `InstrumentFrame`: 1 px outer rule, 8 px machined corner notches, 12 px inner padding, an engraved label (11 px, 600, set into the top rule). Used only for instruments: the plant canvas, annunciator, Today brief and signing readout; never for ordinary cards.
  - Rod gauge: 18 x 56 px vertical gauge in the top bar (section 6.6).
  - Annunciator window: 160 x 56 px backlit tile, dark when clear, lit with its state lamp colour and a state glyph when active.

Reference moves, by element: core as centre of a radial settlement (reference 7); rooms as cutaways with crew at stations that visibly break (5); flow as motion along lines (8); live status as one plain state (1); a live readout you take in at once, as the annunciator and Today brief (2); danger shown before it lands, as the look-ahead tick (4); readouts as machined instruments (3); calm empties (6); dense quiet lists (9).

## 4. Art source and pipeline

**Step 0 decides the route** (section 9). In order of preference:

1. **Image model through Ben's existing accounts:** Gemini image generation (Google AI Pro, used by Antigravity) or ChatGPT image generation (ChatGPT Plus). Before step 0, record in `design/art/PROVENANCE.md` the provider's current terms on ownership and commercial use of outputs, read from the provider's own terms page; a provider whose terms do not let the output ship under this repository's licence is not used.
   - **Registration:** code renders an isometric blockout from the new layout geometry (flat grey volumes for every room, the containment and each seat, with numbered seat anchors) at the exact output size. Every generation is image-to-image from that blockout plus the approved key frame as style reference, so projection, room bounds and seat positions match across all assets.
   - **Clean-up:** each output is cropped to its blockout bounds, colour-matched to the palette roles and checked against its acceptance test before it is committed.
2. **Commissioned illustrator,** if Ben chooses to pay for it, working from the same brief.
3. **No fallback to primitives for hero art.** If neither route reaches the bar after two key frame rounds, stop and ask Ben.

**Asset list.** Separate files, one per layer and state, as WebP with alpha at 2x (and a 1x phone variant), sizes fixed by the blockout:
- Site base at night: 2400 x 1500.
- Containment and core: three states (cold, lit, tripped), 1200 x 1200 each.
- 13 rooms, each in two states (dark, lit), at its blockout size; seat anchors in a sidecar JSON.
- Station overlays per seat style: screen lit, screen broken; 96 x 96.
- Crew poses: seated working, standing (needs you), seated idle (waiting), slumped (stuck); 3 sizes (48, 64, 96 px tall).
- Agent icons for the six built-in agents in `lib/agents.ts:25-32` (Claude Code, Codex, Antigravity, Grok, OpenCode, Ollama) plus a generic fallback glyph for user-named models, as original SVG glyphs drawn for this project, never vendor logos.
- Instrument textures (bezel metal, smoked glass), and the sign-in night backdrop (2880 x 1800).

**Acceptance test per asset** (`tools/check_art_assets.py`): exact pixel size, alpha present, seat anchors within 4 px of the blockout, mean colour within the palette roles' tolerance, and a provenance row with a matching digest.

**Assembly:** a new `PlantScene` component, owned by the application like `ReactorCore` today, so no theme can ever fake a state: the application alone picks which core and room asset shows, from `plant-instruments.ts`. It layers the painted assets (decorative, `aria-hidden`) under the existing semantic layer: the focusable figure buttons and labels from `OfficeStage.tsx` move onto the new seats, and lens colouring, `AgentCard`, `CauseChips`, presenting mode, the portfolio rollup and the your-office queue overflow (`OfficeView.tsx:235-357`, `exceptions.ts`) all stay. Code draws only overlays (lamps, flow, labels, focus rings), never hero art. The focus and selection outline (`--accent`, `office.css:185-188`) stays; the always-on contrast ring (`--office-ring`) is dropped where the painted art gives figures their own edge.

**Occlusion and compositing:** each room is two layers, back (walls and floor) and front (console lip and near wall), with figures between them, so seated crew sit behind their desks. Image-model outputs are opaque, so alpha comes from the blockout's room mask (exact edges from geometry), then a 2 px feathered edge. A room's lit state is generated from its dark state with the same seed and mask, then checked for alignment within 2 px. Bloom and the core glow are baked into the WebP; only lamps and flow are live CSS or SVG.

**Rights and provenance:** `design/art/PROVENANCE.md` records, per asset, the route, the tool and model, the prompt or brief, the date, the licence basis and the SHA-256 of the shipped file. `tools/check_art_provenance.py` fails the build when a shipped asset has no row or a wrong digest.

**Budgets** (all scripted in section 10): total Plant art at most 1.5 MB over the wire at 1440 and 600 kB at 390; with 40 agents animating, at most 5% of frames over 16.7 ms in a Playwright trace under 4x CPU throttling in the CI Chromium.

## 5. What may change and what may not

**May change:**
- Layout and markup of every screen in scope, CSS, and components.
- The Plant layout (`plant-layout.ts`), replaced by the radial layout in section 6.1, with its geometry checks rewritten for the new shape.
- The theme contract: the Plant stops being an `OfficeThemeV1` theme; the `plant` entry leaves `themes/released.json`, and `contract.test.ts` and the drift test drop their plant cases. `PlantScene` is first-party art, so the contract's one-image-per-region, no-filter rule (`contract.ts:35`, `:52-64`) stays in force, unchanged, for the archived office themes.
- `ReactorCore.tsx`'s hex lattice, replaced by the painted core (still application-owned). `ScramBanner` (`Scram.tsx:237`) is restyled into the hazard banner; its data, polling and actions stay.
- Looks: Look A becomes the control room. Look C is retired, with `looks-contrast.test.ts` and `contrast-lib.mjs` updated to match. Look B (light) is retired too unless Ben keeps it (section 12); if kept, it gets the same palette roles and is in every fixture.
- Office themes: the 16 archived office themes stay as they are under Advanced, `standard-office` included. The 15 floor packs are untouched (their release manifest is already empty and `check_theme_assets.py` expects all 15 files).
- Frontend reads: Today may call `api.officeFigures()` and `api.inbox()`; the roster may call `GET /usage`. All exist today.
- Tests that assert old geometry, class names or looks are rewritten to assert the new design's rules. None is deleted to get green; a reviewer compares old and new assertions.

**May not change:** API behaviour (the one additive field in 6.7 needs Ben's sign-off, because CODEOWNERS owns all of `/spec/`); what each instrument claims (`plant-instruments.ts` rules and its unit tests stay unchanged); routes; keyboard access, focus order and visible focus; contrast; Board columns, ordering and actions; trust surfaces (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions, `kernel/`).

## 6. Plant

### 6.1 Composition

A radial site in the section 3 projection. At 1440 x 900 with the shell visible:
- **Centre:** containment and the painted core, at least 25% of the canvas area and its brightest region (both checked by script, section 10).
- **Inner ring:** main control room (your office), verification, review board, work control.
- **Outer arc:** the six work bays.
- **Outside the fence:** staging yard, records vault, hold yard with its striped barrier.
- Same 13 places; only geometry changes.

### 6.2 Flow (reference 8)

The API emits one figure per package (`figures.ts:127`, `distinct on (r.package_id)`), plus intake figures for unpromoted captures (`figures.ts:246-280`), which stand in the intake bay and open their capture, not a card. Individual handoffs between rooms cannot be seen and are not drawn. What can be seen is which stage is active, because a figure's place is its stage. Flow is drawn on the fixed stage pipeline: work bays to verification, verification to review, review and verification to the control room, any room to the hold yard. Because only occupancy is known, motion never suggests a traversal: a pipe segment shows a steady lit stripe, not a moving pulse, while the room it leads into holds a working figure and the room it leaves holds any figure; and the pipe into the control room glows amber only while `needs_me` is above zero. Pipes into empty or idle rooms are dark. Nothing flows from the core.

### 6.3 Crew (reference 5)

Each agent is a painted figure at a seat, with its agent icon and its package title (truncated to fit, full title on focus). Poses by state: working (seated, screen lit), needs you (standing, amber lamp, the control room's lights pulse once every 4 s), waiting (seated, neutral lamp with pause glyph), stuck (slumped, red lamp, station dimmed, screen broken, a slow flicker that becomes a steady red lamp under reduced motion or in a hidden tab), input changed (neutral lamp with diamond mark). Titles that would truncate to the same text show their package ID suffix. Seat counts per room are set so 40 agents fit; above `EXCEPTIONS_AT` (40, `exceptions.ts:12`) the existing folding applies. Layout budget, checked by script at 1440 x 900 with the shell: core and containment at least 25% of the canvas, 13 rooms around it, 76 seats in total (the room grid counts in `plant-layout.ts`, as rendered by `tools/render_blockout.py`), every figure label at least 11 px and never overlapping another label or a room edge.

### 6.4 Annunciator and links

Four windows in an `InstrumentFrame`. Each window's source stays as today (`plant-instruments.ts:77`, `:84`). Waiting on you: every viewer needs-you figure stands in the control room (`figures.ts:286`), so the window links to the control room and to the Inbox, and activating it opens the first item. Stuck and Input changed link to the rooms holding those figures and open the first one's card. SCRAM links to the hazard banner. A lit window shows a thin leader line to its rooms at rest, drawn in the neutral grey with the window's glyph at its end (not a colour). Keyboard: each window is a button; Enter opens its first item.

### 6.5 Look-ahead (reference 4)

One cue, from recorded data: a budget in state `near` (only where the policy sets `budget_near_percent`; otherwise absent, never faked), drawn as a small neutral outline triangle (a shape cue, not a warm colour) on that figure's station, so the needs-you lamp stays the only warm object. A "check finishing, you're next" cue cannot be drawn: a package that waits on the viewer is already projected as needs you (`figures.ts:344` before `:364`), and nothing records who signs next. That part of the `screens.md` row is deferred until the API records it.

### 6.6 Rod gauge and SCRAM

The rod gauge in the top bar shows all five `RodPosition` values (`plant-instruments.ts:127`): withdrawn (no real SCRAM in force; this does not mean work is running), project bank inserted, all inserted, drill (striped), unknown (hatched, "SCRAM status unavailable").

A real SCRAM, within 1 second of the browser learning of it. On a live `scram` message the client invalidates the `scrams` query (`lib/live.ts:159`) after a 300 ms batching timer (`:183`); the 1 s budget is measured from the injected server event to the visible change, and receipt, refresh and visible lock are logged as separate times; if the stream is down, the 30 s poll applies (`OfficeView.tsx:79`), and the top bar says the view is not live. `ScramBanner` and the `scrams` query move from `OfficeView.tsx:229` into `Shell.tsx`, so it shows on every screen. The response follows the trip's scope (`Scram.tsx:67-69`): an organization trip locks every non-SCRAM action; a project trip locks only that project's actions, and the banner names the project. Rods drop on the gauge, the core switches to its tripped asset (glow out, lit red by emergency lighting, matching the `screens.md` row), flow in the tripped scope stops, the shell frame turns red, and the existing `ScramBanner`, restyled as a hazard banner with a diagonal stripe edge (designed here, not taken from #165), shows. A drill has its own fixture and key frame: a striped DRILL plate, rods shown dropping in outline only, and never the trip palette. A stale connection is a fourth fixture: the top bar says "Not live" and lamps dim by one step.

**Technique per effect:** core and room state changes are asset crossfades (200 ms, instant under reduced motion); rod drop is a CSS transform; flow stripes are SVG strokes; lamp pulses are CSS opacity; the hazard banner is static CSS. All animation pauses in a hidden tab.

### 6.7 One additive API field

`AgentFigure.runtime?: string`, the latest run's `RuntimeRef.provider` (`spec/records.tsp:255-259`), mapped to an `AgentId` icon by a small table in `lib/agents.ts` (unknown providers get the generic glyph), so a figure shows its agent icon. Additive in API 0.1 and regenerated per AGENTS.md rule 3, but CODEOWNERS owns `/spec/`, so it needs Ben's recorded yes. If he says no, figures show a role glyph.

### 6.8 Empty, phone, list

- Empty: core cold, rooms dark, no flow; one line: "No agents running. Start work from the Board."
- Phone: below 1024 px, `OfficeView` no longer drops the scene (`OfficeView.tsx:56`, `:134`). It shows, in order: a compact core showing the working count, the annunciator as a 2 x 2 grid, then the zone list. No horizontal scroll; touch targets at least 44 px.
- The painted layers are `aria-hidden`; the figure buttons above them stay focusable with full names, as today. The list (`PlantList.tsx`) stays as the full text equivalent.

## 7. Shell and Board

**Shell:** rail and top bar redrawn in the instrument vocabulary; rod gauge in the top bar; project switcher and New change reachable at every width. Phone: the rail becomes a bottom bar with Board, Plant, Inbox, Today and More; the project switcher and New change sit in the top bar.

**Board (behaviour unchanged):**
1. Cards: title carries hierarchy; one muted metadata line; one accent.
2. Running cards: a status line from the run's `label` (written by the runner, `spec/work.tsp:110`) and elapsed time from `started_at`, for example "Writing tests, 12 min", falling back to "Author running, 12 min" when there is no label. This replaces the static "An agent is working on it" (`lib/next.ts:82`). `useBoardData` already loads runs (`useBoardData.ts:165`); it passes the latest run through to `Card`. No per-run event fetch. Under the line, a 2 px moving progress cue (indeterminate), static under reduced motion.
3. Cards waiting on you are the only amber cards. The existing attention-first order stays as it is: needs-you and blocked cards rise together, stably, within a column, while the stream is live (`boardOrder.ts:4-14`).
4. Author and checker agent icons from the runs' runtime providers.
5. Designed empty state with one action.
6. **Drawer as cockpit:** replace the three tabs (`BoardReviewDrawer.tsx:110`) with one layout at 1440 x 900: a status header with the Overview facts (custody, criteria, pre-check, switches) as a compact strip; left, the run log; right, the outputs preview, with a new unified diff view for `.diff` and `.patch` outputs (line numbers, added and removed lines marked by sign and tint, not colour alone); bottom, the decision bar, always visible. Below 1024 px it falls back to stacked sections in the same order.
7. Phone: a single-column list grouped by column with sticky column headers; the drawer opens full screen with the decision bar pinned at the bottom.

## 8. Today, Inbox, Sign in, Setup, roster

- **Today:** adds `api.officeFigures()` and `api.inbox()` to its reads (packages and `ActiveRunList` today, `Today.tsx:10-17`, `:63`). A shift brief in an `InstrumentFrame`: one headline sentence ("2 decisions waiting, 6 agents working, 1 stuck"), three readouts, then the needs-you list, all above the fold at 1440 x 900. A calm finished state when nothing needs you: the plant thumbnail at rest and "Nothing needs you." Phone: the same order, one column.
- **Inbox:** a risk band at each item's left edge, its height and glyph by risk rank (order unchanged: riskiest first); each list item shows a short digest where it has one (`scram`, `permission` and `lost` items have none, `inbox.ts:111-234`); signing happens in the review drawer (`Inbox.tsx:135-140`), where the bound revision and digest sit as an instrument readout above the decision buttons; a designed calm empty state. Phone: the readout stacks above full-width decision buttons.
- **Sign in:** the night site backdrop from the art set, dimmed, behind a bezel-framed panel, for all four sign-in states (register, sign in, accept an invitation, error; `SignIn.tsx:86-93`). Phone: the backdrop crops to the core.
- **Setup:** detected agents appear as seats at a table that light up as found; then the existing three-way confirm.
- **Agents roster:** seats with icon, name, status and toggle, and runs this window per runtime from `GET /usage` telemetry (`{runtime, runs, reported}`, `budgets.ts:369-373`). Agent budgets are keyed to the agent baseline, not to a runtime, so the roster does not show a per-agent budget; the organization's remaining budget shows once above the seats.
- Phone layouts for each are designed and shipped in the same step as the desktop layout.

## 9. Steps

Each step ends with screenshots, scripted checks and the critic (section 10), and its screenshots are posted to Ben. Steps 0, 1 and 2 wait for his yes; steps 3 to 5 continue unless he says stop; merge waits for his yes. Each step is its own commit on one PR.

0. **Key frames (no code in `apps/web`).** Record the art route's terms. Render the blockout. Produce 3 directions of the Plant (healthy, needs you, SCRAM) at 1440 and 390, each with a labels-off, effects-off crop, plus one quiet Today frame in the chosen direction. Fix the hex palette in `design/art/style.md`. Ben picks one or kills the route.
1. **Vertical slice.** `InstrumentFrame`, the rod gauge, the annunciator tile and the type tokens first, then `PlantScene` with the core, two rooms, crew poses, live state, flow, the semantic layer and the phone layout, on fixtures (cold, busy 40, SCRAM, drill). Ben looks before the rest is built.
2. **Rest of the Plant.** All 13 rooms, annunciator links, look-ahead, hazard banner moved into the shell, retirement of the plant theme entry (`themes/plant.ts`, `build-plant-theme.ts`, `public/office-themes/plant/` and the CSS they used) and the retired looks.
3. **Shell and Board.**
4. **Today and Inbox.**
5. **Sign in, Setup, roster.**
6. **Translation review** by Antigravity and Codex against this plan, item by item.

Builders are Sonnet subagents, one per step or sub-step, with Claude orchestrating and checking each result; steps 3 to 5 run in parallel after step 2, each on separate files.

**Risks:** art quality (two key frame rounds, then stop and ask); style drift across assets (blockout registration, per-asset acceptance test); scope (deferrals named in section 11); performance (budgets scripted); a data claim the code can't support (every binding names its source line).

## 10. Verification

- **Fixtures and harness:** `apps/web/e2e/visual-bar.spec.ts` renders every row of section 11 from deterministic fixtures at 1440 x 900 and 390 x 844 (and Look B if kept), plus a 200 px thumbnail of empty and busy, a busy Board with a long patch output, and a risk-ranked Inbox. Motion rows are captured as short timestamped clips, measured from the injected event.
- **Scripted checks:** core area share at least 25% and highest mean luminance of any region; warm-pixel share (hue 330 through 0 to 60 degrees, saturation above 40%, so reds count) under 0.5% of the canvas in the healthy fixture, and in the needs-you fixture the control room lamp holds at least 60% of the warm pixels; healthy-state cyan capped by the same method at the share measured in the approved key frame; text contrast measured over the painted pixels behind each label, not only token pairs; empty versus busy 200 px thumbnails at least 0.15 apart by SSIM distance; labels at least 11 px and non-overlapping; SCRAM visual change complete within 1000 ms of the injected event; no running animation under reduced motion or in a hidden tab; no horizontal scroll at 390; frame-time budget (section 4); axe (`@axe-core/playwright`) with no serious or critical issues; contrast tests extended to every token pair the new CSS uses.
- **Critic:** after each step, a model that did not build it grades screenshots row by row, pass or fail with a reason. Before first use it grades a calibration set (the three merged #153 screenshots in `.nuclear/changes/plant-view/evidence/screenshots/` and the #165 screenshots, committed in step 0 to `.nuclear/changes/control-room-redesign/evidence/calibration/`, as known fails; the approved key frames as known passes) and must fail every known fail and pass every known pass. Claude spot-checks 10% of its passes each step.
- **Before and after:** each row's screenshot sits next to the main baseline and the approved key frame.
- **Relapse check:** `plant-scene.test.tsx` fails if `PlantScene` renders a hero slot (core, room, figure body) without its raster asset, or if any hero slot's DOM contains vector shapes; overlays are limited to named components (`Lamp`, `FlowStripe`, `Label`, `FocusOutline`). The same check covers Sign in and the Today thumbnail.
- **Thresholds:** the numbers above are starting values; step 0 measures main and the approved key frames with the same scripts, and the thresholds are set from those recorded outputs (AGENTS.md rule 5) before step 1.
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
| Plant | About to need you | 6.5 (budget near only; "check finishing" deferred, no data) |
| Plant | Stuck looks broken | 6.3 |
| Plant | SCRAM full screen within 1 s | 6.6 |
| Plant | Drill | 6.6 |
| Plant | Phone | 6.8 |
| Board | Empty | 7.5 |
| Board | Dense and quiet | 7.1 |
| Board | Running status line and progress cue | 7.2 |
| Board | Waiting on you amber, first | 7.3 (order already attention-first) |
| Board | Agent icons | 7.4 |
| Board | Drawer cockpit | 7.6, including a new diff view |
| Today | Shift brief above the fold | 8 |
| Today | Calm finished state | 8 |
| Inbox | Risk band | 8 |
| Inbox | Weighty signing | 8 |
| Inbox | Calm empty | 8 |
| Sign in | Night plant mood | 4, 8 |
| Setup | Seats light up | 8 |
| Roster | Seats with toggles and usage | 8 |

## 12. Decisions for Ben

1. Art route: image generation in his existing accounts first; a paid illustrator only if he chooses. Default: existing accounts.
2. Look B (light): retire it for one theme, or keep it as a reading-comfort option. Default: retire.
3. The additive `AgentFigure.runtime` field in `spec/` (CODEOWNERS). Default: add it.

## 13. What the reviews changed

### v1 to v2

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

### v2 to v3

- Flow: drawn on the stage pipeline from which rooms hold working figures, because the API gives one figure per package and no handoffs (Codex, Antigravity).
- Look-ahead: "check finishing" removed as impossible with today's data and marked deferred; budget near kept (Codex, Antigravity).
- SCRAM timing: from the browser learning of it, over the live stream (about 300 ms) with the 30 s poll as fallback (Antigravity, Codex, Fable).
- Art pipeline: named providers, terms recorded before step 0, blockout registration, separate files per layer and state at fixed sizes, per-asset acceptance tests, Ollama icon (Fable, Antigravity).
- Signature elements dimensioned; annunciator tile back in the set; core light cold, not warm; needs-you pulse and stuck dimming added; flicker stops under reduced motion (Fable, Antigravity).
- Semantic layer kept: figure buttons, lenses, `AgentCard`, `CauseChips`, presenting mode, portfolio and queue overflow stay on top of the painted layers (Antigravity, Fable).
- Board: status line from `Run.label`, no per-run event fetch; progress cue; diff view built; Overview facts kept in the cockpit (Antigravity, Fable).
- Roster usage from `GET /usage` instead of deferred; Today notes `ActiveRunList` (Antigravity).
- Phone designed for every screen, including shell navigation (Antigravity).
- Repository fit: change record before step 0; `spec/` field needs Ben's sign-off; `type-scale.test.ts`, contrast tests, `contract.test.ts` and floor packs handled; `ScramBanner` restyled, not replaced; `ReactorCore`'s no-fake guarantee kept by `PlantScene` (Fable, Antigravity).
- Verification: numeric thresholds, frame-time budget scripted, clips for motion, critic spot-checks, concrete relapse check, Look B in fixtures if kept; posted screenshots at every step (Fable, Codex).
- Instrument components built in step 1, before the Plant uses them (Antigravity).

### v3 to v3.1 (round 3 corrections, no further grading)

- Six built-in agents plus a generic fallback, not seven (all three reviewers).
- Semantic layer cited where it lives: `OfficeView.tsx` and `exceptions.ts`, not `OfficeStage.tsx` (Fable, Antigravity).
- `--office-ring` is the always-on contrast ring; focus is `--accent`, which stays (Antigravity).
- `ScramBanner` hoisted into the shell; project and organization trips lock different scopes; drill and stale-connection fixtures; latency measured end to end (Antigravity, Codex).
- Flow shows a steady occupancy cue, not a traversal (Codex). Look-ahead tick is a neutral shape (Antigravity, Fable).
- Room occlusion layers, alpha from the blockout mask, lit-from-dark registration, baked bloom (Antigravity, Fable).
- Type tokens named to pass `type-scale.test.ts`; Sign in has four states; Inbox signing lives in the drawer; roster shows per-runtime runs, not a per-agent budget join (Antigravity).
- Warm check counts reds; label contrast over art; critic calibrated on passes too; #165 screenshots committed; thresholds set from measured baselines; Ben's yes after step 2 as well (Fable).
- Change record plan matches section 9 (Fable, Antigravity).
