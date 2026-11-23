# The Plant: one dedicated nuclear facility view

Plan, Nov 23, 2026. Repo checked at `306e078` (main). Status: draft for independent adversarial review (Codex, Claude Fable 5.2, opencode on GLM 5.3) before any code.

## 1. What Ben asked for

- Replace the office/factory view with **one excellent, on-brand nuclear facility theme**: a control room, a reactor, confinement layers and zoning.
- "I would rather have one excellent on-brand theme than fifteen to twenty mediocre ones."
- Keep the office themes, but **archive** them.
- The tab must be **much more beautiful and excellent**.
- Standing rules: look and feel is a top priority and ambitious changes are welcome; the default stays minimalist and intuitive, complexity behind Advanced; build for thousands of users, not one setup; no scheduled jobs; no engineering number typed by a model.

## 2. What exists today (facts from the repo)

- `/office` renders `features/office/OfficeView.tsx`: a fixed 1200×640 canvas (`layout.ts`) with **13 places** owned by the app: six cube sets (process, mechanical, electrical, civil, assurance, project-controls) and seven rooms (review, interface, verification, your-office, document-control, bench, quarantine). Capacity is at least 40 figures before healthy work folds (`EXCEPTIONS_AT = 40`).
- The 13 place IDs are a contract: `AgentFigure.place: FigurePlace` in `spec/api.tsp:514`. The API decides where each figure stands. Five states (working, needs, waiting, stuck, changed), each with a recorded cause.
- `OfficeStage.tsx` has two layers: an inert **scene** layer (theme art as `<img>`, no pointer) and the app's **semantic** layer (name plates, figures, marks, codes, all buttons with full accessible names). A theme is data only (`contract.ts` `OfficeThemeV1`: five scene tokens, one label + one SVG per region, body styles), and its SVG is checked against an element/attribute allowlist (`validateSvg`).
- Themes: `standard-office` (default) plus 15 worlds, all `released` (owner approval 2026-11-18), with a Theme picker on the view. Art is procedural SVG from `apps/web/scripts/build-office-themes.ts` and `tools/build_office_worlds.py`; a test fails if committed art drifts from the generator.
- Separately, `/floor` carries an older station floor with its own 15 packs, behind `VITE_FLOOR_THEMES_ENABLED`, with an empty release manifest. Not reachable from the navigation.
- SCRAM lives on the office view (`Scram.tsx`, `api.scrams()`), passkey-signed, with a banner while active.
- Navigation: `places/places.ts` lists "Office: The floor: who is working on what".
- Prior direction (Platform Plan, "The plant", Nov 22): home becomes a control room; annunciator = Needs you; instruments per agent (context, fuel and time to refueling, power level, burn rate, trip status); taste rules (no trefoil, no hazard stripes as decoration, no disaster jokes, no real plant's name or layout, no regulatory claim, never red/green alone, quiet when normal); "built as a new world on the Floor engine and becomes the default". This plan supersedes "on the Floor engine": the office engine is the live one.
- Open PRs #135, #136, #137, #150 do not touch `features/office/`, `features/floor/` or `places/`. #137 touches `components/Shell.tsx` and `styles.css`, so this work stays out of both.

## 3. The direction in one paragraph

The Office tab becomes **Plant**. It draws one original, generic facility in cross-section and plan: nested confinement boundaries with the reactor at the centre, the agents working inside containment, the main control room just outside it where you decide, and the rest of the site in outer zones. Every place keeps its plain functional name; the plant name is the setting. An **annunciator strip** across the top is dark when nothing needs you and lights one window per condition. The **reactor core** is a live, honest instrument: it shows how many agents are working, and its control rods drop when a SCRAM is in force. There is no theme picker in the default view. The 16 office themes move to an "Archived office themes" choice under Advanced.

## 4. Zoning: the 13 places on the plant

Zones nest from the outside in. Each zone is drawn as a boundary line with its name, and each place sits inside exactly one zone. The zone tells you how close the work is to the core, which matches how isolated and trusted it is.

| Zone (outside in) | Place ID (contract) | Functional name (always shown) | Plant label (setting) | Why it sits here |
|---|---|---|---|---|
| Owner-controlled area | `document-control` | Document control | Records vault | Accepted records leave the controlled work and are filed |
| Owner-controlled area | `bench` | Bench | Staging yard | Queued work waits outside the boundary for its turn |
| Protected area | `interface` | Interface | Work control | Work waiting on another discipline's input is screened here before it goes back in |
| Protected area | `review` | Review | Review board | Disputes and loops a person rules on |
| Vital area | `your-office` | Your office | Main control room | Decisions and permissions waiting on you; you are the shift supervisor |
| Vital area | `verification` | Verification | Independent verification | Blind pre-checks, separate from the crews |
| Vital area | `quarantine` | Quarantine | Isolation | Security holds and SCRAM-stopped work, isolated |
| Containment | `process` … `project-controls` (6) | Process, Mechanical, Electrical, Civil, Assurance, Project controls | Bay 1 to Bay 6 | Agents do the work inside confinement: their own worktree and sandbox |
| Core (not a place) | none | Reactor | Reactor | A live instrument, not a seat (section 6) |

Notes:
- "Owner-controlled area", "protected area", "vital area" and "containment" are general industry terms for nested security and confinement boundaries. They are used as setting only, with a tooltip, never as a claim about any regulation. Ben to confirm wording.
- The figure placement logic does not change. `seatFigures` places each figure by `AgentFigure.place`; only the geometry it reads changes.

## 5. Layout

A second app-owned layout, `plant-layout.ts`, with the same `Region` shape and the same 13 IDs, so seating, overflow, lenses, exceptions and the agent card are reused unchanged.

- **Canvas** 1280×800 (aspect 1.6), scaled to the container like today.
- **Containment** is a rounded rectangle centred on the canvas (about 760×400), drawn with a dome-section outline. The **core** (about 200×200) sits in its centre. The six bays sit three above and three below the core inside containment, each with a 3×2 seat grid (36 seats).
- **Vital area** ring: Main control room on the left of containment (largest room, 2×3 seats plus its door queue), Independent verification and Isolation on the right.
- **Protected area** ring: Work control and Review board along the top band.
- **Owner-controlled area**: Staging yard and Records vault along the bottom band.
- Capacity stays at least 40 seats plus queue places, so folding behaves as today.
- `validateLayout` is generalised to take a layout (regions, canvas, name band, clearance) and the plant layout must pass every existing invariant: inside the canvas, no overlap, seats clear of name plates and walls, fully marked neighbours never touch. A new invariant: every region lies wholly inside its declared zone, and zones nest without crossing. The corridor `route()` check is replaced, for the plant, by a check that every place's door opens onto its zone's walkway. (`route()` has no caller outside validation today.)
- Below 960 CSS px wide, or at 200% zoom, the plant shows the existing list of figures by zone, with a static thumbnail of the plant; no horizontal scroll at 320 px.

## 6. Live instruments (only from recorded data)

1. **Annunciator strip** (top of the tab, app-owned semantic HTML, not art). Windows, left to right: Needs you, Stuck, Changed input, Waiting, SCRAM. Each window shows its name and count in text. A window with zero is dark (outlined, muted text, still readable). A lit window has a filled face, a shape mark (the existing `StateMark` shapes), and a count. The **first-out** window (the condition that began earliest, from `since`) carries a "First out" tag. Clicking a lit window applies the matching filter to the plant and list. Counts come from `GET /office/figures` and `api.scrams()` only. No sound, no flashing; a newly lit window gets a single 600 ms emphasis in Full motion and none in Reduced.
2. **Reactor core** (scene art plus a semantic caption). Fuel assemblies are drawn as a fixed grid of squares. The number of glowing assemblies equals the number of figures in state `working`, capped at the grid size with "+N" in the caption. The caption reads, for example, "Reactor: 7 agents working". With no working figure the core is dark and says "Reactor: shut down, no agent working". This is a count, not a power level: no percentage, no MW, no invented number.
3. **Control rods** are drawn withdrawn normally. While any SCRAM is in force (`api.scrams()` reports an active one) they are drawn fully inserted, the core goes dark, and the caption reads "Reactor tripped: SCRAM in force since <time>". The SCRAM control itself stays where it is, unchanged.
4. **Instruments not built now** (Platform Plan): per-agent context, fuel and time to refueling, burn rate. The APIs do not report them yet (`subscriptions.go` checks sign-in only). They are not drawn, not even as placeholders, until a data source exists.

## 7. Look

- **Original, generic facility**, procedurally generated SVG, no reference images, no real plant's layout, no trefoil, no hazard stripes, no disaster imagery.
- **Palette**: a deep blue-black site at night; containment in cool concrete greys with a fine blueprint linework; the core in a restrained blue glow (the colour of Cherenkov light, used as a mood, not a claim); amber and white for the annunciator, matching control-board convention, with shape and text always carrying the meaning. Semantic colours remain the app's own (`StateMark`, `tokens.css`) and are never set by the theme.
- **Depth**: zone boundaries as double lines with small gate breaks where doors are; walkways; bays with equipment silhouettes (racks, consoles, pipe runs) at low contrast so figures read first.
- **Figures** keep the existing semantic marks. Plant-specific body styles: operators in coveralls and hard hats, six silhouettes, original.
- **Motion** (Full only, paused when the tab is hidden): a slow breathing glow in the core proportional to nothing but "on" or "off"; no camera moves; nothing loops in the outer zones. `prefers-reduced-motion` or the Still setting removes all of it.
- **Typography**: the app's own fonts; tabular numerals for counts; zone names in small caps.
- **Quality bar**: the plant must pass the existing office quality harness (`office-harness.tsx`, `e2e/office-harness.spec.ts`): contrast of every plate and figure against its art, no semantic element covered by art, figure extents inside regions at minimum zoom, axe clean.

## 8. The contract change

`OfficeThemeV1` gains one optional asset, `site`, an SVG exactly the canvas size, drawn behind the region art. It passes the same `validateSvg` allowlist. A theme also names the layout it is drawn for: `layout: "office" | "plant"`. Region art must match that layout's region sizes. The 16 existing themes declare `layout: "office"`; the plant declares `layout: "plant"`. The core and annunciator are app code, not theme data, so a theme can never fake an instrument.

## 9. Archiving the office themes

- `registry.ts`: `DEFAULT_OFFICE_THEME` becomes `plant`. The 16 current themes move to `ARCHIVED_THEMES`. They keep their files, tests and approvals; nothing is deleted.
- The Theme picker leaves the header. An **Advanced** disclosure at the foot of the tab holds "Archived office themes", a select whose first option is "None (Plant)". Choosing one renders the old office layout with that theme, labelled "Archived theme" in the header, with a one-click "Back to Plant".
- The remembered choice moves to a new key, `controlrod.plant.view.<member>`. The old key is not read, so everyone lands on Plant once after the upgrade.
- `/floor` and its 15 packs: left in place and unchanged in this PR (unreachable from navigation, flag-gated, nothing released). Retiring it is a separate cleanup; noted in the change record.

## 10. Navigation and words

- `places.ts`: "Office" becomes **Plant**, purpose "The plant: who is working, where, and what needs you". Route `/plant`; `/office` redirects to `/plant` so links keep working.
- Header: "Plant" with the count line kept ("2 agents wait on you · 9 agents on the floor" becomes "… in the plant").
- Every plant label has a tooltip with the plain meaning, for example "Main control room: decisions and permissions waiting on you."
- Presenting mode, lenses, cause chips, the portfolio table, overflow list and the agent card all stay, unchanged in behaviour.

## 11. Build steps (one draft PR)

1. Generalise `validateLayout`; add `plant-layout.ts` and its tests (invariants, zone nesting, capacity ≥ 40).
2. Contract: `layout` field and optional `site` asset; update `validateSvg` call sites and contract tests.
3. Generator: `scripts/build-plant-theme.ts` writes `public/office-themes/plant/` and `themes/plant.ts`, with a drift test like the existing one.
4. `PlantStage` (or `OfficeStage` with a layout prop): the site layer, region art, core and rods layer, then the unchanged semantic layer.
5. `Annunciator.tsx` and `ReactorCore.tsx`, driven only by figures and SCRAM status; unit tests for counts, first-out, dark state, trip state, cap.
6. `OfficeView`: default Plant, Advanced disclosure with archived themes, new storage key; update `office-view.test.tsx`.
7. Places, route and redirect; update `places.test.tsx`.
8. Quality harness: add the plant; run `e2e/office-harness.spec.ts` on Chromium; screenshots at 1440, 1024 and 390 px, light and dark OS, Full and Reduced motion, into the change record's evidence.
9. Change record `.nuclear/changes/plant-view/` (basis, risk, plan, trace, verification, ship); `docs/office-view/` gains a plant section; `docs/status.md` line.
10. Blind check by a different vendor than the author, then Ben's art approval on the screenshots before merge.

## 12. Out of scope

Per-agent instruments (context, fuel, time to refueling, burn rate); other plant areas from the Platform Plan (simulator, switchyard, corrective action cards, turnover); the One-line tab and disconnect switches; sound; any API, `spec/`, kernel, policy, red-team or workflow change.

## 13. Risks to look at hard

- **Theme metaphor overriding meaning.** A plant label hides what a place does. Control: functional name always on the plate, plant label second, tooltip explains.
- **The core reads as a gauge with a number it does not have.** Control: count only, captioned in words, no units, no percentage.
- **Colour.** Amber and blue on dark must pass contrast for text and marks; status never by colour alone.
- **Taste.** A nuclear setting invites cliché and alarm. Control: the taste rules above; nothing implies danger when nothing is wrong; the plant is quiet when normal.
- **Layout density.** 40+ figures inside nested zones at 1024 px may get cramped. Control: harness measurement at minimum zoom; fold healthy work as today.
- **Archive regressions.** Someone who chose a world loses it once. Accepted, by Ben's direction; one click under Advanced brings it back.
- **Open PR collisions.** Stay out of `Shell.tsx`, `styles.css`, `api/`, e2e live tests.

## 14. Questions for Ben (non-blocking; defaults in bold)

1. Tab name: **Plant** (alternatives: Facility, Site).
2. Zone words: **Owner-controlled area, Protected area, Vital area, Containment** (alternative: plain "Site, Fence, Inner, Containment").
3. Art approval: **Ben approves from the PR screenshots**, recorded in the change record, as the 2026-11-18 approval was.
