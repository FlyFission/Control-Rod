# Adversarial Review: Working World Overlay Themes Quality & Fidelity Audit

**Reviewer:** Argon (Independent Adversarial Reviewer, Google Antigravity / AGY)  
**Date:** 2026-11-06  
**Audit Scope:** 15 overlay themes, vector generators (`tools/build_theme_art.py`, `tools/theme_art_backdrops.py`, `tools/theme_art_casts.py`, `tools/theme_art_props.py`), theme packs, catalog (`apps/web/src/features/floor/themes/catalog.ts`), and compiled public SVG assets.  
**Acceptance Threshold:** 10/10 across all five objective criteria.  
**Verdict:** **REJECTED / BLOCKED (0 of 15 themes meet the 10/10 bar; fleet average: 6.86/10)**.

---

## 1. Executive Verdict

The Control Rod 15-world overlay system represents an ambitious, syntactically conforming procedural vector art pipeline, but it currently falls well short of production readiness and the required 10/10 standard. While the procedural build gate passes technical validation and the casts display creative silhouette work, the visual architecture suffers from three fatal systemic defects:
1. **Severe Occlusion & Broken Spatial Hierarchy:** The six semantic station backplates are rendered as 100% opaque rectangles covering **73.6% of the 1000×600 canvas**, directly burying between 70% and 94% of the procedural scenery (including `pocket-lab`'s central chalkboard, `corner-cafe`'s sunlit arched window, `confectionery-works`'s lollipop trees, and `midnight-bureau`'s skyscraper skyline).
2. **Fraudulent "Pixel" Medium Execution:** All three designated pixel themes (`lanternwood-guild`, `wildlight-camp`, `voxel-foundry`) masquerade as 16-bit or voxel art while relying heavily on smooth cubic/quadratic Bézier curves, antialiased vector circles/ellipses, continuous diagonal vector lines, smooth rounded corners (`rx="26"`), and zero authentic pixel dithering, producing rampant mixels.
3. **Severe Performance & Budget Blowouts Alongside IP Edge Violations:** Two themes (`midnight-bureau` at 48.0KB and `corner-cafe` at 44.0KB) blow through the `<30KB scene` budget by up to 60.2% due to hundreds of redundant inline `<rect>` elements that are largely invisible under opaque station cards. Crucially, `corner-cafe` commits an explicit cleanroom violation by rendering an "iconic tufted plush velvet couch", in direct contravention of `docs/overlay-themes/originality.md`.

No theme earns a 10/10. Release must remain gated until these architectural and medium flaws are remediated.

---

## 2. Scorecard Matrix

*Scoring scale: 1 (Failing/Unacceptable) to 10 (Masterful/Flawless across all rubric demands). Threshold: 10/10 across all five.*

| # | Theme ID | Display Title | Genre Resonance (1-10) | Medium Craft (1-10) | Cleanroom IP (1-10) | Station Ergonomics (1-10) | Technical Conformance (1-10) | Overall Score | Verdict |
|---|---|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 01 | `creature-dispatch` | The Monster Mailroom | 7 | 6 | 9 | 5 | 9 | **7.2** | FAIL |
| 02 | `pocket-lab` | Little Helpers Laboratory | 6 | 5 | 9 | 4 | 9 | **6.6** | FAIL |
| 03 | `midnight-bureau` | Heist Night | 6 | 4 | 9 | 4 | 3 | **5.2** | FAIL |
| 04 | `confectionery-works` | The Chocolate Factory | 6 | 5 | 7 | 4 | 9 | **6.2** | FAIL |
| 05 | `lanternwood-guild` | The Lantern Woods Guild | 6 | 3 | 9 | 5 | 9 | **6.4** | FAIL |
| 06 | `corner-cafe` | The Coffee House Crew | 7 | 4 | 4 | 4 | 3 | **4.4** | FAIL |
| 07 | `tumbletown-workshop` | Tumbletown Rhyme Works | 7 | 6 | 9 | 5 | 9 | **7.2** | FAIL |
| 08 | `orbital-shipyard` | Starport Shipyard | 7 | 6 | 9 | 5 | 9 | **7.2** | FAIL |
| 09 | `wildlight-camp` | Critter Expedition Camp | 7 | 3 | 9 | 5 | 10 | **6.8** | FAIL |
| 10 | `voxel-foundry` | Blockworks Foundry | 7 | 4 | 9 | 5 | 9 | **6.8** | FAIL |
| 11 | `cloudspring-bathhouse` | The Cloudspring Baths | 8 | 7 | 7 | 5 | 10 | **7.4** | FAIL |
| 12 | `button-and-spool` | Thimble Town | 8 | 7 | 9 | 7 | 10 | **8.2** | FAIL |
| 13 | `clockwork-observatory` | Clockwork Stargazers | 8 | 7 | 10 | 5 | 9 | **7.8** | FAIL |
| 14 | `coral-commons` | Reef Town | 8 | 7 | 9 | 5 | 9 | **7.6** | FAIL |
| 15 | `meadow-post` | Cozy Critter Village | 8 | 7 | 9 | 5 | 10 | **7.8** | FAIL |
| **Fleet** | **Fleet Average** | — | **7.07** | **5.40** | **8.47** | **4.87** | **8.47** | **6.86** | **REJECTED** |

---

## 3. Numbered Adversarial Findings

### Finding 1: CRITICAL — Severe Scene Byte Budget Violations (>30KB Limit)
- **Severity:** Critical
- **Affected Themes:** `midnight-bureau` (48,047 bytes, +60.2% over budget), `corner-cafe` (44,037 bytes, +46.8% over budget).
- **Evidence:**
  - Rubric criterion 5 establishes: `<30KB scene, <2KB character`.
  - In `tools/theme_art_backdrops.py` lines 68-78 (`midnight-bureau`), the script generates 11 skyline skyscrapers with nested loops rendering over 350 individual `<rect>` window elements:
    ```python
    for wy in range(290 - sh, 250, 16):
        for wx in range(sx + 8, sx + sw - 8, 12):
            if (wx + wy) % 5 != 0:
                s += f'<rect x="{wx}" y="{wy}" width="4" height="6" fill="{d}" opacity=".4"/>'
    ```
  - In `tools/theme_art_backdrops.py` lines 141-144 (`corner-cafe`), the script generates 15 vertical rows of brick masonry across the entire top half of the screen, producing 330 individual `<rect>` elements:
    ```python
    for by in range(0, 270, 18):
        offset = 16 if (by // 18) % 2 == 1 else 0
        for bx in range(-20, 1020, 48):
            s += f'<rect x="{bx + offset}" y="{by}" width="44" height="14" rx="2" fill="{mix(a, .3)}" stroke="{mix(d, .15)}" stroke-width="1"/>'
    ```
  - Resulting scene asset sizes:
    - `apps/web/public/floor-themes/midnight-bureau/scene.*.svg`: **48,047 bytes**.
    - `apps/web/public/floor-themes/corner-cafe/scene.*.svg`: **44,037 bytes**.
- **Impact:** Substantial DOM bloat and rasterization overhead during theme switching on constrained hardware. Worse, as detailed in Finding 3, over 80% of these generated rectangles are completely occluded beneath opaque station cards, meaning the client downloads and parses tens of kilobytes of invisible nodes.
- **Recommendation:** Replace individual inline window and brick rectangles with SVG `<pattern>` definitions or merged `<path>` elements (`d="M...h...v...z"`). A single SVG pattern will reduce both scenes below 12KB with zero visual fidelity loss.

---

### Finding 2: CRITICAL — False Pixel Art & Severe Mixel Contamination in Designated Pixel Themes
- **Severity:** Critical
- **Affected Themes:** `lanternwood-guild`, `wildlight-camp`, `voxel-foundry`.
- **Evidence:**
  - Rubric criterion 2 explicitly demands for pixel themes: *"strict grid alignment, authentic 16-bit dithering, crisp stepped pixel geometry, zero mixels."*
  - **`wildlight-camp` (`Critter Expedition Camp`):**
    - `tools/theme_art_backdrops.py` line 192 announces: `# AUTHENTIC 16-BIT PIXEL ART AESTHETIC!`.
    - Lines 196-198 immediately violate this with continuous non-stepped diagonal vectors: `polygon points="{tx},60 {tx-60},160 {tx+60},160"`.
    - Line 200 draws a smooth vector ellipse for the campfire: `ellipse cx="500" cy="300" rx="34" ry="14"`.
    - Lines 201-204 draw smooth vector circles: `circle cx="475" cy="298" r="7"`.
    - `tools/theme_art_casts.py` lines 156-164 draw smooth Bézier curves (`q24 6 18 18-16 4-24-10`) and smooth ellipses (`ellipse cx="64" cy="72" rx="26" ry="32"`).
    - `tools/build_theme_art.py` line 233 sets station corner radius to `rx="26"`, a large smooth vector curve!
    - Result: It contains zero stepped pixels, zero dithering, and is 100% standard vector art mislabeled as pixel art.
  - **`lanternwood-guild` (`The Lantern Woods Guild`):**
    - Backdrop canopy uses stepped 8px/12px rectangles, but the characters (`tools/theme_art_casts.py` lines 87-91) use continuous Bézier splines (`M30 103l10-50q24-30 48 0l10 50z`), vector ellipses for heads (`CAFE_HEADS`), and smooth station plates (`rx="26"`).
    - Stepped pixel elements sit directly adjacent to 1px vector lines, causing extreme mixel artifacts.
  - **`voxel-foundry` (`Blockworks Foundry`):**
    - Billed as isometric voxel pixel art, but uses flat 2D polygonal projections (`M{vx} {vy}l{size} -{h_s}...`) without any voxel texturing, grid alignment, or 16-bit dithering, alongside smooth vector circular eyes (`circle cx="64" cy="52" r="8"`) and ellipse drop shadows.
- **Impact:** Complete failure to fulfill the stated medium. True pixel aesthetics require uniform pixel grid quantization (e.g. 4×4 or 2×2 screen pixel units) across background, stations, props, and characters.
- **Recommendation:** Implement a true pixel-quantization helper in `tools/build_theme_art.py` that snaps all paths, strokes, character silhouettes, and station boundaries to an integer pixel grid, or remove the pixel art claim and adopt an honest clean illustrative aesthetic.

---

### Finding 3: CRITICAL — Architectural Occlusion: Opaque Station Plates Bury 70%–94% of Theme Scenery
- **Severity:** Critical
- **Affected Themes:** All 15 themes (systemic architectural flaw).
- **Evidence:**
  - In `tools/build_theme_art.py`, `STATIONS` defines the 6 semantic stations:
    - `general`: (20, 20, 300, 240) [x: 20–320, y: 20–260]
    - `site`: (340, 20, 320, 240) [x: 340–660, y: 20–260]
    - `archive`: (680, 20, 300, 240) [x: 680–980, y: 20–260]
    - `verify`: (20, 340, 340, 240) [x: 20–360, y: 340–580]
    - `office`: (380, 340, 260, 240) [x: 380–640, y: 340–580]
    - `bench`: (660, 340, 320, 240) [x: 660–980, y: 340–580]
  - Combined surface area: `72,000 + 76,800 + 72,000 + 81,600 + 62,400 + 76,800 = 441,600 px²`, representing **73.6% of the entire 600,000 px² viewport**.
  - In `tools/build_theme_art.py` lines 225-234, `scene()` first injects `backdrop()`, and then renders the 6 stations:
    ```python
    s += theme_art_backdrops.backdrop(world, a, b, c, d, dark, light, accent, rng)
    ...
    for index, (key, r) in enumerate(STATIONS.items()):
        s += f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rounding}" fill="{mix(a,.32)}" .../>'
    ```
  - `mix(a, .32)` outputs an **opaque hex color** (`#rrggbb`).
  - Consequently, major signature architectural set pieces authored in `theme_art_backdrops.py` are painted over by opaque rectangles:
    - **`pocket-lab`:** Giant green chalkboard at `x="330" y="58" width="340" height="48"`. `site` station covers `x=340..660, y=20..260`. **94.1% of the chalkboard (all chalk formulas, atomic orbits, and gears) is completely invisible**.
    - **`corner-cafe`:** Arched sunlit window at `x="410" y="110" width="180" height="130"`. `site` covers `x=340..660, y=20..260`. **The entire central window and brownstone view is 100% covered**.
    - **`confectionery-works`:** Giant spiral lollipop trees at (120, 170), (490, 150), and (860, 160). All three tree heads fall directly inside `general`, `site`, and `archive` station plates and are **100% occluded**.
    - **`creature-dispatch`:** Pneumatic transfer tubes at `tx in (180, 500, 820)` running `y=0..600`. The parcels inside the tubes at `y=200` and `y=350` are **completely covered**.
    - **`cloudspring-bathhouse`:** Pagoda eaves at `y=64..106` and steam plumes at `y=100..220` are **80% covered**.
- **Impact:** The vast majority of the procedural artwork created to establish genre resonance never reaches the user's retina. Viewers only see the 80px horizontal strip in the promenade (`y=260..340`) and 20px peripheral margins.
- **Recommendation:**
  1. Redesign station cards to use semi-transparent fills (`fill-opacity="0.65"` or CSS backdrop filters), OR
  2. Anchor environmental set pieces strictly in the visible negative space: the promenade (`y=260..340`), the vertical bay seams (`x=320..340`, `x=660..680`), and an expanded upper skylight band (increase top margin from 20px to 60px).

---

### Finding 4: MAJOR — Cleanroom Boundary Violation: sitcom coffee house Couch in `corner-cafe`
- **Severity:** Major
- **Affected Theme:** `corner-cafe` (`The Coffee House Crew`)
- **Evidence:**
  - `docs/overlay-themes/originality.md` line 47 explicitly dictates:
    > *"The café world avoids a fixed group size and signature furniture for the same reason."*
  - Line 54 reinforces:
    > *"No emblems, insignia, logos, game interfaces, signature props or set layouts from existing works."*
  - `docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md` line 91 specifies:
    > *"Original architecture and furniture, not a replica of any existing television set."*
  - Despite this clear prohibition, `tools/theme_art_backdrops.py` lines 153-155 explicitly authors sitcom coffee house's signature orange/amber tufted plush velvet couch:
    ```python
    # Iconic tufted plush velvet couch silhouette in center promenade
    s += (f'<rect x="440" y="278" width="120" height="24" rx="8" fill="{c}"/>'
          f'<path d="M430 270h140v12H430zM425 280h15v22h-15zM560 280h15v22h-15z" fill="{mix(c, .8)}"/>')
    ```
  - The developer comment itself acknowledges it as the *"Iconic tufted plush velvet couch"*.
- **Impact:** In an open-source project designed to withstand external intellectual property scrutiny, intentionally placing the unmistakable signature furniture piece of an iconic copyrighted television sitcom directly contravenes the project's own cleanroom policy.
- **Recommendation:** Immediately remove the tufted couch. Replace it with generic café bistro furniture: small round café tables (`rx="16" ry="6"`), bentwood chairs, or an espresso counter with ceramic grinders.

---

### Finding 5: MAJOR — Uniformity & Silhouette Regression in `confectionery-works`
- **Severity:** Major
- **Affected Theme:** `confectionery-works` (`The Chocolate Factory`)
- **Evidence:**
  - `docs/overlay-themes/originality.md` line 47 mandates:
    > *"no small workers in matching outfits"*.
  - `docs/superpowers/specs/2026-10-25-overlay-themes-catalog.md` line 69 specifies six diverse characters:
    > *"flour-dusted pastry artisan; sugar-glass automaton; moth-winged wrapper; ceramic kettle attendant; ribbon-haired mixer; pear-shaped clockwork taster. Avoid any existing factory-worker or chocolatier character design, costume or lyrics."*
  - In `tools/theme_art_casts.py` lines 218-224, `extras()` overrides every character variant in `confectionery-works` with an identical chef hat (`#fbf6ec`) and bowtie:
    ```python
    if world == CONFECTIONERY:
        seat = [10, 2, 14, 4, 8, 0][v]
        return (
            f'<g transform="translate(0 {seat})"><path d="M42 31q-10-13 4-17 3-13 17-5 16-8 18 7 12 5 3 16z" fill="#fbf6ec"/>'
            f'<path d="M44 32h39" stroke="{c}" stroke-width="4"/></g>'
            f'<path d="M56 84l8 9 8-9z" fill="{c}"/>'
        )
    ```
- **Impact:** Slapping the identical puffy baker's cap and bowtie onto every cast member destroys character individuality and risks presenting a uniform troupe of factory workers, flirting with the very trope forbidden by `originality.md`.
- **Recommendation:** Remove the universal chef hat and bowtie loop. Author individual headwear per variant: sugar goggles for the automaton, confectioner's scarf for the pastry artisan, antennae for the moth-winged wrapper, and a monocle loupe for the taster.

---

### Finding 6: MAJOR — High Franchise Proximity in `cloudspring-bathhouse`
- **Severity:** Major
- **Affected Theme:** `cloudspring-bathhouse` (`The Cloudspring Baths`)
- **Evidence:**
  - `tools/theme_art_backdrops.py` line 246 renders an *"Arched red vermilion footbridge in center promenade"*:
    ```python
    s += (f'<path d="M410 300q90-36 180 0" fill="none" stroke="{c}" stroke-width="12"/>'
          f'<path d="M410 294q90-36 180 0" fill="none" stroke="{d}" stroke-width="2"/>')
    for px in (440, 480, 520, 560):
        s += f'<rect x="{px}" y="{280}" width="5" height="18" fill="{c}"/>'
    ```
  - Coupled with multi-tiered cedar pagoda rooflines with upturned eaves (lines 239-241) and porcelain hot-spring attendants, this cluster of visual elements strongly evokes the iconic entrance to bathhouse proprietor's bathhouse in animated film studio's *bathhouse film set*.
  - `docs/overlay-themes/originality.md` line 19 warns against: *"A cluster of borrowed clues that together decode to one franchise."*
- **Impact:** While traditional Japanese bathhouse architecture is in the public cultural domain, the specific combination of an arched vermilion bridge spanning the entrance to a magical multi-tiered pagoda bathhouse staffed by silent porcelain/spirit attendants will be immediately identified by viewers as a *bathhouse film set* clone.
- **Recommendation:** Replace the red arched vermilion bridge with stepped slate paving stones across a thermal stream, or an interior bamboo boardwalk. Recast the pagoda eaves into rustic onsen timber framing.

---

### Finding 7: MINOR — Monotonous Station Geometry & Ergonomic Rigidity
- **Severity:** Minor
- **Affected Themes:** All 15 themes.
- **Evidence:**
  - Across all 15 themes, `STATIONS` enforces an identical 2×3 grid layout with hardcoded bounding boxes.
  - Every station in every world receives identical interior styling:
    - Top header plate: `<rect x="{x+1}" y="{y+1}" width="{w-2}" height="32"...>`
    - Bottom desk strip: `<path d="M{x+14} {y+h-30}h{w-28}l-8 15H{x+22}z"...>`
    - Vignette at `(x+w-42, y+22)`
    - Three identical dot indicators: `<circle cx="{x+22+j*9}" cy="{y+h-22}" r="2"...>`
- **Impact:** The themes feel like cosmetic palette swaps applied to an unvarying desk template rather than authentically bespoke world environments (e.g. an orbital shipyard should have flight consoles, an observatory should have circular charting benches, a meadow post office should have sorting pigeonholes).
- **Recommendation:** Parameterize station interior furniture in `tools/build_theme_art.py` so each theme pack can define world-appropriate workstation shapes (consoles, shelves, benches, counters, docks).

---

### Finding 8: MINOR — Incongruous Character House Styles Across Genres
- **Severity:** Minor
- **Affected Themes:** `lanternwood-guild`, `voxel-foundry`, `midnight-bureau`.
- **Evidence:**
  - In `tools/build_theme_art.py` lines 64-68, all characters share hardcoded house primitives:
    - Shadow: `<ellipse cx="64" cy="114" rx="34" ry="7" fill="#091726" opacity=".24"/>`
    - Legs: `<path d="M47 93l-5 17h14l4-17M72 93l1 17h15l-8-17" fill="#243b4b"/>`
    - Eyes: `<ellipse cx="52" cy="57" rx="4" ry="6"...>`
  - In `voxel-foundry`, characters with rigid cubic heads have smooth organic ellipse eyes and smooth oval drop shadows.
  - In `midnight-bureau`, sophisticated human planners in sharp business suits have cartoony round button eyes and oversized stubby legs.
- **Impact:** Erodes medium fidelity and genre tone. The cinematic heist theme looks cartoonish; the voxel theme looks inconsistent.
- **Recommendation:** Allow `theme_art_casts.py` to define world-specific eye and shadow geometry (e.g., angular rectangular shadows and visor slits for voxels; slit eyes or no facial features for sleek noir silhouettes).

---

## 4. The Top Improvements Required for a 10/10 Score

To achieve a unanimous 10/10 across all five criteria, the following concrete changes must be made:

1. **Resolve Backdrop Occlusion & Invert Station Opacity:**
   - Change station card fills from opaque `mix(a, .32)` to semi-transparent (`fill-opacity="0.65"` or `"0.7"`) or cutout frames with subtle borders.
   - Relocate primary narrative set pieces (chalkboards, skylines, trees, boilers, pipes) into the upper 80px ceiling band and the central 80px promenade (`y=260..340`), guaranteeing 100% unobstructed visibility.
2. **Optimize Scene SVGs to Comply with <30KB Budget:**
   - In `midnight-bureau`, replace the 350+ individual `<rect>` window elements with an SVG `<pattern id="skyline-windows">` or a merged single `<path>` element.
   - In `corner-cafe`, replace the 330 brick `<rect>` nodes with an SVG brick wall pattern.
   - Verify that all 15 scene files are under 25KB uncompressed.
3. **Achieve True Medium Authenticity in Pixel Themes:**
   - In `wildlight-camp` and `lanternwood-guild`, replace all continuous vector curves, diagonal polygon strokes, and smooth corner radiuses (`rx="26"`) with stepped, integer-quantized pixel coordinates.
   - Eliminate all mixels: characters, backdrops, props, and station borders must adhere to a unified grid resolution.
4. **Purge Cleanroom IP Infractions:**
   - Remove the "iconic tufted plush velvet couch" from `corner-cafe` (`tools/theme_art_backdrops.py` lines 153-156) and replace with generic wooden bistro tables.
   - In `confectionery-works`, remove the universal matching chef hat and bowtie extras (`tools/theme_art_casts.py` lines 218-224); give each variant unique, asymmetric headwear.
   - In `cloudspring-bathhouse`, redesign the arched red vermilion bridge into a natural stone terrace or bamboo boardwalk to avoid *bathhouse film set* set-piece overlap.
5. **Differentiate Station Interior Architecture:**
   - Replace the generic repeated "desk at bottom + 3 dots" template with world-specific functional furniture: curved laboratory benches in `pocket-lab`, control consoles in `orbital-shipyard`, sorting cubbies in `creature-dispatch`, and stone drafting tables in `lanternwood-guild`.

---

*Report filed by Argon. No files were mutated during this audit.*
