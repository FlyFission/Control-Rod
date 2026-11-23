# The Plant: one dedicated nuclear facility view

Plan v2, Nov 23, 2026. Repo checked at `306e078` (main). v1 was reviewed blind by two independent reviewers: the Codex CLI (OpenAI) and a second reviewer (Anthropic). A third review through the opencode CLI could not run because no provider was signed in. Section 15 lists what changed because of the reviews.

## 1. What Ben asked for

- Replace the office/factory view with **one excellent, on-brand nuclear facility theme**: a control room, a reactor, confinement layers and zoning.
- "I would rather have one excellent on-brand theme than fifteen to twenty mediocre ones."
- Keep the office themes, but **archive** them.
- The tab must be **much more beautiful and excellent**.
- Standing rules: look and feel is a top priority; the default stays minimalist, complexity behind Advanced; build for thousands of users; no scheduled jobs; no engineering number typed by a model.

## 2. What exists today (facts from the repo)

- `/office` renders `features/office/OfficeView.tsx` on a fixed 1200×640 canvas (`layout.ts`) with **13 places**: six cube sets and seven rooms. `AgentFigure.place: FigurePlace` (`spec/api.tsp:503`, `:547`) is a contract, so the 13 IDs stay. Unmapped disciplines fall back to Process (`place_defaulted`).
- The stage has an inert scene layer (theme SVG as `<img>`) under the app's semantic layer (plates, figures, marks, all with accessible names). The stage is a dark island with a `min-width: 960px` (0.8 of 1200), the zoom the clearance constants assume (`layout.ts:88-106`, `office.css:14-15`).
- 17 registered themes (`registry.ts:11`): `standard-office` (default), `harness-bright` (test only) and 15 worlds; 16 are released (`themes/released.json`). Production copies only the files each theme's `assets.json` manifest names (`vite.config.ts:101-134`).
- SCRAM (`Scram.tsx`) is organization- or project-scoped, can be a drill, is "in force" until restarted for its whole scope, and its timing (`pulled_at`, `stopped`) is optional: present only once recorded (`spec/api.tsp:1049-1075`). Presenting, the read is redacted (no reason, runs or who pulled it) but keeps scope, drill flag and timing (`services/api/src/scram.ts`, `activeScramsFor`).
- `/floor` is a separate, flag-gated station floor with an empty release manifest, unreachable from navigation.
- The shell's SCRAM banner links to `/office` (`Shell.tsx:220`); `Shell.tsx` and `styles.css` are touched by open PR #137, so this work stays out of both. #135, #136 and #150 do not touch the office, floor or places code.

## 3. The direction in one paragraph

The Office tab becomes **Plant**: one original, generic facility drawn as a **single plan view, like a general arrangement drawing**. Hairline boundaries nest from the site edge inward, with each zone's name set into its line. The reactor building holds the core, drawn in plan as a lattice with control rod positions. The agents work in six work bays, each its own confinement cell, which is what a sandboxed worktree is. The main control room, where you decide, is the only warm-lit room on the page, and only while something waits on you. A quiet **annunciator** in the header replaces the count line: dark when all is well, one lit window per abnormal condition. There is no theme picker in the default view; the office themes move under Advanced.

## 4. Zoning

Plain words only. No physical-security terms with regulatory meaning (owner-controlled, protected, vital area), and no "containment isolation" collisions.

| Zone (outside in) | Place ID | Functional name (always on the plate) | Plant label (second line) |
|---|---|---|---|
| Site | `bench` | Bench | Staging yard |
| Site | `document-control` | Document control | Records vault |
| Site | `quarantine` | Quarantine | Hold yard |
| Plant fence | `interface` | Interface | Work control |
| Plant fence | `review` | Review | Review board |
| Plant fence | `verification` | Verification | Independent verification |
| Plant fence | `your-office` | Your office | Main control room |
| Plant fence, auxiliary building | six cube sets | Process … Project controls | none (one label is enough) |
| Plant fence, reactor building | none (not a seat) | Reactor | Core |

- Held and quarantined work sits outside the fence, the least trusted place on the site.
- Each work bay is drawn with its own double wall: the confinement boundary around one agent's worktree and sandbox. Nobody is drawn beside the core.
- The plant label is the second plate line, and the region's `aria-label` carries the plain meaning (plates are not interactive, so no tooltip-only meaning). A small legend under the stage explains the zones once.

## 5. Layout

A second app-owned layout, `plant-layout.ts`, same `Region` shape and same 13 IDs.

- **Canvas width stays 1200** so 960 px is still 0.8 zoom and every clearance constant holds. Height is computed by the layout code from the bands below, not typed here.
- **Band 1, inside the fence:** Main control room (2×2 seats plus its door queue, as today, so its test holds), the reactor building (core only, no seats), Independent verification, Work control, Review board.
- **Band 2, inside the fence:** the auxiliary building, six work bays in one row, the same 3×2 grid and width as today's cube sets.
- **Band 3, the site outside the fence:** Staging yard, Records vault, Hold yard.
- Walkways run between bands, with gate breaks in the fence line where doors open onto them.
- `validateLayout` is generalised to take a layout object (canvas, bands, regions, zones, walkways). The plant must pass every existing invariant plus: every region and its full queue footprint lie inside its declared zone; zones nest without crossing; every door opens onto a walkway, and every walkway connects to every other through gate openings (graph check, not door points); no seat, queue place or plate overlaps the reactor building.
- Capacity stays at least 40, and a test puts 40 figures in one place to check overflow goes to the list, never on top of each other.
- Every coordinate comes from the layout code and its tests (AGENTS.md rule 5).

## 6. Instruments (only from recorded data, unknown never shown as zero)

**Annunciator** (in the header, replacing the count line; page HTML styled from app tokens, so it works in every look, light ones included). Four windows: **Waiting on you** (`needs_me`; the existing "N more in the Inbox with no agent yet" sentence stays beside it), **Stuck**, **Input changed**, **SCRAM**. Normal waiting is not a window, so the strip is dark when the plant is normal.

- Each window states its name and count in text. Zero: outlined, muted but contrast-passing. Lit: filled, with the `StateMark` shape. Loading: "…" and "Loading". Error: "Unavailable". Stale (last read older than its 30 s refresh interval plus a 10 s grace, so a reading is not marked stale while its refresh is in flight; or its last refresh failed). The view checks the age every 10 s, so an overdue reading is marked within 50 s of the last successful read at worst: the count with "as of <time>". The same "as of" goes on the core, the rods, the console status and the empty-floor line.
- No "first out" tag (here it would just mean "oldest", and it would hold forever).
- Waiting on you links to the Inbox. The others are status only; no new filter.
- One polite live region for the whole strip, announcing only when a window changes between confirmed dark and lit readings, not on every refresh, and never across a change of who is counted (turning presenting on or off starts from a new first reading).
- Presenting: counts cover the shown figures, and the strip says "N hidden" when `hidden > 0`.

**Core** (scene art in the reactor building, with its caption on the building's plate). A fixed lattice; positions carry no identity.

- Lit when at least one shown figure is `working`; dark otherwise. The caption is a count in words: "7 agents working" or "No agent working". Presenting with hidden figures: "7 shown working, 3 hidden". Loading or error: neutral, caption "Status unavailable". No percentage, no units, no "shut down".

**Control rods** (in the core's lattice), from `api.scrams()` only:

| SCRAM data | Rods | Caption |
|---|---|---|
| Loading or error | hatched, no position | "SCRAM status unavailable" |
| None in force | withdrawn | none |
| Organization SCRAM in force | inserted | "SCRAM in force: organization" plus "runs stopped at <time>" only when `stopped` is recorded, else "stop not yet recorded" |
| Project SCRAM(s) only | one bank inserted | "SCRAM in force: N projects" (the scope says which projects stopped; it proves nothing about other work) |
| Drill | dashed outline | "Drill", never darkens the core |

The SCRAM control and banner stay as they are. The core and rods read separate queries on separate intervals, so each caption stands on its own source.

## 7. Look

- **One projection.** Pure plan view, one hairline weight for boundaries, a heavier line only for each work bay's double wall. Zone names in small caps set into their lines. No dome, no elevation, few or no equipment silhouettes. Generous empty space.
- **Palette.** Deep blue-black site; cool greys; the core a restrained blue when lit. Amber appears only on a lit annunciator window and on the control room when something waits on you. Semantic colours stay the app's own.
- **Figures.** One restrained operator silhouette (body styles kept, low contrast); detail only on selection.
- **Motion.** Revised on 2026-11-23 after the owner's review of the first build ("too elementary"; wanted real graphic art and effects): while the core is lit, its glow breathes, the polar crane turns slowly and flow moves along the pipe rack; a newly lit annunciator window flashes three times. Everything else changes only on a change of state. All motion stops with `prefers-reduced-motion` or a hidden tab, and the harness checks both. There is no Full/Quiet/Still setting on the office today and this plan does not add one.
- **SVG budget.** The `validateSvg` allowlist (no pattern, use, filter, mask or text; 500 KB per file) holds. Glow is a radial gradient; linework is few long paths.
- **Fits above the fold.** The annunciator replaces the count line, and the zone legend sits under the stage. The stack above the stage gets shorter, not taller.

## 8. Contract

`OfficeThemeV1` gains two optional fields: `layout: "plant"` (absent means the office layout, so the 17 existing generated themes need no change or regeneration) and `site`, one SVG exactly the canvas size drawn behind region art. `validateTheme` accepts the two keys, sizes art from the declared layout, and requires `site` to be in the theme's `assets.json` with its digest, so production copies it. The core, rods and annunciator are app code; a theme cannot fake an instrument.

## 9. Archiving the office themes

- `DEFAULT_OFFICE_THEME` becomes `plant`; `released.json` adds `plant`. The 16 released office themes stay released and on disk, listed as archived. `harness-bright` stays a test theme.
- The header Theme picker goes. An **Advanced** disclosure under the stage holds "Archived office themes", first option "None: show the Plant". Choosing one shows the old office layout with that theme, a header note "Archived theme", and "Back to Plant".
- New storage key `controlrod.plant.view.<member>`; the old key is not read, so everyone lands on the Plant once.
- `/floor` is unchanged here; retiring it is a separate cleanup, noted in the change record.

## 10. Small screens

There is no full figure list today; the office only lists overflow. The plan adds a **Plant list**: every figure grouped by zone and place, each a button that opens the same agent card, same states and marks in text. It shows below 1024 px container width (where the stage would drop under 0.8 zoom next to the card) and is reachable by a "List" toggle at any width.

## 11. Navigation and words

- `places.ts`: "Office" becomes **Plant**, purpose "Who is working, where, and what needs you". Route `/plant`; `/office` redirects (the shell's SCRAM link and the floor's link rely on it; a test covers it).
- README: the "Fifteen office worlds" line becomes the Plant. The README screenshot spec is not edited here; refreshing the shot is a follow-up.

## 12. Build steps (one draft PR)

1. Change record `.nuclear/changes/plant-view/` first (basis, risk, plan), per AGENTS.md rule 1.
2. Generalise `validateLayout`; add `plant-layout.ts` and tests (invariants, zones, walkway graph, capacity, 40-in-one-place).
3. Contract fields and tests.
4. Generator `scripts/build-plant-theme.ts` writing `public/office-themes/plant/` with `assets.json` and `themes/plant.ts`, plus a drift test.
5. Stage takes a layout; site layer; core and rods; unchanged semantic layer; Plant list.
6. `Annunciator.tsx` and core/rod state functions, unit-tested for every row of section 6.
7. `OfficeView`: Plant default, Advanced archive, storage key; tests.
8. Places, route, redirect; tests.
9. Harness: plant fixture at 1200 wide; Chromium e2e on real `/plant` at 1440, 1024, 390 and 320 px, 200% zoom, every app look, forced colours and reduced motion; screenshots into evidence.
10. Change record verification, trace and ship; `docs/office-view/` plant section; `docs/status.md`; README line.
11. Blind check by a different vendor than the author; Ben approves the art from the screenshots. Art approval is not a signature for any protected surface, and none is touched.

## 13. Out of scope

Per-agent instruments (context, fuel and time to refueling, burn rate) until a data source exists; other plant areas (simulator, switchyard, corrective action cards, turnover); the One-line tab; sound; any API, `spec/`, kernel, policy, red-team or workflow change; the README screenshot spec.

## 14. Questions for Ben (non-blocking; defaults in bold)

1. Tab name: **Plant** (alternatives: Facility, Site).
2. Art approval from the PR screenshots: **yes**, recorded in the change record.

## 15. What the reviews changed

Both reviewers, independently:
- The v1 core-in-containment layout could not fit the seat clearances (a 3×2 bay needs about 186 tall; v1 left 100). Now: the reactor building holds no seats, bays get their own band, the canvas stays 1200 wide.
- The v1 core and rods could state untrue things (project SCRAMs, drills, partial restarts, missing timing, presenting-mode hidden figures, failed loads). Now: the state table in section 6.
- Drop "first out". Done.
- Create the change record first. Done (step 1).

Codex: walkway graph and queue-footprint checks; a full small-screen list; real-page contrast tests at 320 px, zoom, forced colours; `site` must be in the manifest; plain functional names over trust words; one drawing convention, one quiet count line, amber only for exceptions.

Second reviewer: 0.8 minimum zoom (canvas width 1200); physical-security zone terms dropped; quarantine moved outside the fence; nobody beside the core; one projection (plan) only; annunciator without the normal "waiting" window and designed for light looks; it replaces the count line instead of adding height; plates are not interactive, so meanings go in `aria-label` and a legend; `harness-bright` counted; README and redirect covered; one warm light on the control room.

## 16. Visual overhaul after the owner's review (2026-11-23)

The owner found the first build too plain. The second pass keeps every rule above and raises the art: a console frame around the drawing (status bar with the count in each zone and the plant's state, grid references A to L and 1 to 9, corner marks); a night site lit by work lights, with the fence's posts and gates, a pipe rack along the inner walkway and the auxiliary building's columns; rooms with lit floors, wall shading and their equipment (the control room's horseshoe console and display wall, workstations with lit screens in every bay, the glass partition in verification, the planning table in work control, the review board's table, containers in the staging yard, shelving and the vault door in the records vault, and a striped barrier with warning lamps around the hold yard); operators with hard hats and reflective bands; the reactor as containment, polar crane, vessel and a hexagonal core with bloom, whose vessel rings red under a SCRAM; a pool of light under each figure in its state's colour (scene layer, never the only sign of state); and backlit annunciator windows that stay dark in every look, amber when lit and red for Stuck and SCRAM. A separate, widget based control room dashboard is a later feature and not part of this change.
