# Control room redesign

Plan v1, 2026-11-24. Repo checked at `main` `0f6fd54`. Builds against the reference board in [`design/references/`](../../../design/references/README.md) and its per-screen bar in [`screens.md`](../../../design/references/screens.md).

## 1. Why this plan exists

Three visual rounds on the Plant view (#153 twice, then #165) ended at about the same look. The review on 2026-11-24 found four causes, and this plan answers each one:

| Cause | Answer in this plan |
|---|---|
| No art: the plant was rectangles drawn by a script, and every round restyled the CSS around it | Section 5: new illustrated plant, drawn as layered SVG artwork, with a style sheet the art must follow |
| Adjective briefs, no target | Section 3: every screen is built to the pass or fail rows in `screens.md`, and each row names the reference it borrows from |
| Rules that ruled out an overhaul ("no behaviour changes, all tests pass", tests pinning the old geometry) | Section 4: layout, components and geometry may change; tests that pin old geometry are rewritten for the new layout; data, API behaviour, instrument truthfulness and accessibility stay fixed |
| Code review as the finish line | Section 9: a visual critic grades screenshots against `screens.md` every round; Codex and Antigravity check the code and the plan's translation; Ben's yes on screenshots is the merge gate |

## 2. Goal

When Ben opens the next update, every main screen looks and feels like one coherent, beautiful nuclear control room, and the Plant is something people screenshot and share. Measured by: every row of `screens.md` passes for every screen in scope, at 1440 px and 390 px, graded by a model that did not build it, and Ben says yes.

## 3. The design language (applies to every screen)

From the reference board: calm when healthy, unmistakable when not (real control-room practice, references 1 and 9).

1. **Palette.** Near-monochrome blue-grey base for the healthy state. Exactly one warm attention colour (amber) for "needs you". One trip colour (red) for stuck and SCRAM. Cyan only for live, running things. No other hues in chrome. Tokens in `apps/web/src/design/tokens.css`; contrast checked by the existing `check-contrast.mjs` for every pair used.
2. **Type.** Hierarchy from the type scale and weight, not boxes (reference 9). A mono face only for instrument readouts (counts, IDs, digests, timers). No letter-spaced mono for labels or body text.
3. **Signature element: the instrument bezel.** One reusable frame component (`InstrumentFrame`) with machined corners, a fine rule and a small engraved label (reference 3). Used for the plant canvas, the annunciator, the Today brief and the signing readout, so any cropped screenshot is recognisably Control Rod.
4. **The rod gauge.** A small vertical gauge showing rod position (out = running, in = SCRAM, partial = project SCRAMs), driven only by `rodState()` in `plant-instruments.ts`. It lives in the top bar on every screen, so SCRAM state is visible everywhere.
5. **Motion.** Motion only means "running" or "changing" (reference 8). Durations 150 to 400 ms for UI, slow loops for live flow. Every animation stops under `prefers-reduced-motion` and when the tab is hidden, using the existing visibility guard pattern in `OfficeStage.tsx`.
6. **Depth.** Two levels only: the page, and raised instrument surfaces. No stacked glows; one bloom, on the reactor.

## 4. What may change and what may not

May change: layout of every screen in scope, components and their markup, CSS, the plant layout (`plant-layout.ts`) and its art, tests that assert the old geometry or old class names (each rewritten to assert the new design's rules, never deleted to get green).

May not change: the API and its data, apart from one additive field in section 5.6; what each instrument claims (the rules in `plant-instruments.ts`: unknown is never shown as zero, drills never light the SCRAM window); routes and navigation targets; keyboard access, focus order and visible focus; contrast; the Board's behaviour (columns, ordering, actions); trust surfaces (`policies/`, `tests/redteam/`, `.github/workflows/`, `spec/` major versions, `kernel/`).

## 5. Plant (the centrepiece)

### 5.1 Layout: the reactor as hero (reference 7)

Replace the two rows of boxes with a radial site plan:

- **Centre:** the reactor building, holding the illustrated core. At 1440 x 900 the core and its containment ring take at least 25% of the canvas area.
- **Inner ring (inside the plant fence):** main control room (your office), verification, review board, work control (interface), arranged around containment, each a room with stations.
- **Outer arc (auxiliary building):** the six work bays (process, mechanical, electrical, civil, assurance, project controls).
- **Outside the fence:** staging yard (bench), records vault (document control), hold yard (quarantine), kept from the current plan, including the hold yard's striped barrier.
- **Flow lines:** coolant-style pipes from the core to each room. A pipe carries moving pulses only while that room has a working agent (reference 8).

The same 13 places as today; only their geometry changes. `plant-layout.ts` keeps `validatePlantLayout` style checks (no overlaps, seats inside rooms, minimum clearances) rewritten for the radial layout.

### 5.2 Art (references 5 and 7)

- Illustrated rooms in a consistent 3/4 top-down cutaway style: floor, walls with thickness, consoles, screens and lights as layered SVG, one gradient light source from top left, a fixed palette of 8 art colours derived from the tokens.
- Generated by `apps/web/scripts/build-plant-theme.ts` (rewritten) from reusable parts (console, desk, rack, screen, lamp, pipe, door), so art stays original, consistent and reviewable as code. No third-party images.
- Each room has an **unoccupied** and an **occupied** lighting state: dark and cold when empty, lit when an agent works there. The core has **cold**, **lit** and **tripped** states.
- An art style sheet (`design/plant-art.md`) fixes the angle, light, line weights, palette and part list before any room is drawn.

### 5.3 Agents as crew (reference 5)

- Each agent is a small figure at a station, with an icon for its agent kind and a label with the package title, shortened to fit.
- State reads from the figure and its station: working (screen lit, subtle motion), needs you (amber lamp over the station), waiting (figure idle, violet lamp), stuck (station screen broken, red lamp flicker), input changed (amber outline).
- At 40 agents, figures stay legible: a room shows up to its seat count; extra agents collapse into a "+N" plate that opens the list.

### 5.4 Annunciator, needs-you and look-ahead (references 1 and 4)

- The annunciator keeps its four windows and sits in an `InstrumentFrame` above the canvas.
- Hovering or focusing a window highlights the rooms that hold those agents, and vice versa.
- **Look-ahead:** an agent whose budget state is `near` gets a small amber tick on its station before it needs you (data: `FigureSpend.state`). Nothing else is predicted.

### 5.5 SCRAM and drill

- **Real SCRAM:** within one second the rod gauge drops, the core turns to its tripped state, flow stops, the canvas frame turns red and the hazard banner from #165 shows. Only the real-trip rule in `plant-instruments.ts` triggers it.
- **Drill:** the canvas shows a diagonal striped "DRILL" plate; nothing uses the trip palette.

### 5.6 One additive API field

`AgentFigure.runtime?: string` (the runtime provider of the figure's latest run, for example `claude` or `codex`), so a figure can show its agent's icon. Additive within API 0.1, regenerated per AGENTS.md rule 3. If the owner or the reviewers reject it, figures show the role icon instead and no API change is made.

### 5.7 Empty, phone and list

- Empty: core cold, rooms dark, no flow, and one line under the canvas: "No agents running. Start work from the Board."
- Phone (390 px): a designed stack, not the desktop squeezed: rod gauge and annunciator as a 2 x 2 grid, a compact illustrated core showing working count, then the list grouped by zone. No horizontal scroll. Project switcher and New change stay reachable (fixes #165's phone finding).
- The list view stays as the accessible equivalent of the drawing.

## 6. Board

The Board's behaviour, columns and order stay. Visual changes only:

1. Dense, quiet cards: title carries the hierarchy, metadata in one muted line (reference 9).
2. Running cards show a live status line in plain words ("Writing tests, 12 min") and a thin moving progress cue (reference 1).
3. Cards waiting on you are the only amber cards.
4. Agent icons for author and checker on each card, from the run's runtime.
5. A designed empty state with one action, "Add a card" (reference 6).
6. The card drawer: status header, run log, outputs and the decision area laid out so the decision is visible at 1440 x 900 without scrolling (reference 3).

## 7. Today, Inbox, Sign in, Setup and Agents roster

- **Today:** a shift brief in an `InstrumentFrame`: one headline sentence, at most three readouts (needs you, running, stuck), then the needs-you list. A calm finished state when nothing needs you (references 1, 2, 6).
- **Inbox:** a risk band at the left edge of each item, riskiest first (unchanged order); the signing area shows the bound revision and digest as an instrument readout above the buttons (references 3, 4).
- **Sign in:** the plant at night, built from the same art parts, dimmed behind the sign-in panel; keeps #165's corner brackets (reference 7).
- **Setup:** detected agents appear as seats at a table, each lighting up when found, then the existing three-way confirm (reference 5).
- **Agents roster:** seats with icon, name, status and on/off toggle; details stay under Advanced (references 5, 3).

## 8. Out of scope

The widget "control room" dashboard (a later feature), Packages, Policies, Audit pages, new behaviour on any screen, and anything in section 4's "may not change" list.

## 9. Process

1. **Plan review.** Claude, Antigravity (Neon) and Codex (gpt-6.2-astra) each write their own grading criteria without seeing the others, then grade this plan. The plan is revised 1 to 2 times.
2. **Build.** Sonnet subagents build in this order, each a separate commit: (a) design language and shared components; (b) plant layout and art; (c) plant states, crew and SCRAM; (d) Board; (e) Today, Inbox, Sign in, Setup, roster; (f) phone layouts.
3. **Screenshot harness.** A committed Playwright script (`apps/web/e2e/visual-bar.spec.ts`, skipped unless `SHOTS_DIR` is set) renders every row of `screens.md` from fixtures at 1440 x 900 and 390 x 844.
4. **Visual critic.** After each build step, a model that did not build it grades the screenshots row by row against `screens.md` (pass or fail with one line why). Any fail goes back to the builder. A step is done when all its rows pass.
5. **Checks.** Typecheck, unit tests, the contrast check, the office harness (rewritten for the new geometry), reduced-motion and hidden-tab checks, originality check, change record validation.
6. **Translation review.** Before merge, Antigravity and Codex review the built result against this plan, item by item, and report anything that did not carry over.
7. **Merge gate.** Ben's yes on the screenshots.

## 10. Risks

| Risk | Control |
|---|---|
| Code-drawn SVG art still looks amateur | Art style sheet first; one room drawn and critic-graded before the rest; if it fails twice, stop and ask Ben about commissioning an illustrator |
| Rewriting geometry tests weakens them | Each rewritten test asserts the new layout's rules (no overlap, clearance, legibility at 40 agents); a reviewer compares old and new assertions |
| Conflicts with #164 and #165 | Rebase onto main after they land; keep #165's SCRAM banner and sign-in brackets |
| Performance with many animated SVG parts | One requestAnimationFrame loop, CSS transforms only, paused when hidden; measured at 40 agents |
| Instruments show something untrue | Every visual state reads from `plant-instruments.ts`; its unit tests stay unchanged and must pass |

## 11. Exit criteria

Every `screens.md` row for the screens in sections 5 to 7 passes at both sizes, graded by a non-building model; all checks in section 9.5 pass; the translation review finds nothing missing or the gaps are written up; Ben says yes.
