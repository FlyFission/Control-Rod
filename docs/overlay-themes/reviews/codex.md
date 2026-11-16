# Adversarial review: Working World overlay themes

## Executive verdict

**No theme meets the brief’s unanimous 10/10 acceptance threshold.** The most consequential defect is shared by all fifteen: opaque station rectangles are drawn *after* the new architectural backdrops, hiding much of the artwork that is supposed to establish each world. In a rendered contact sheet of the current thumbnails, the result is largely the same six-panel interface with different colors, characters, and small repeated decorations. The three themes identified as pixel art also use smooth curves, gradients, fractional or incompatible dimensions, and translucent overlays; they do not satisfy the brief’s strict pixel-art standard. Heist Night and The Coffee House Crew exceed the requested scene-size limit. Asset integrity and TypeScript checks passed in this review, but current browser performance, interaction, accessibility, and full test results were not established. The artwork remains development-stage, and the originality scores below are provisional assessments—not legal clearance.

## Review basis and scoring

The review covers the **current working tree**, including its modified and untracked generated assets, rather than only commit `2243205`. I rendered all fifteen current thumbnails together for visual inspection, inspected the generator and representative output structure, checked all manifest asset hashes and byte counts, parsed the SVGs as XML, ran the repository asset and originality checks, and ran the web TypeScript compiler with `--noEmit`.

Scores are adversarial reviewer judgments on the requested 1–10 scale. **Overall is the lowest criterion score**, because the brief requires 10 in *every* column; averaging would obscure a failing criterion. The originality, ergonomics, and technical scores include an evidence-confidence penalty where a required review or current runtime test was unavailable. They should not be read as proof of infringement, an observed interaction failure, or a measured frame-rate failure.

| Theme | Genre | Craft | Originality | Ergonomics | Technical | Overall | Principal reason it falls short |
|---|---:|---:|---:|---:|---:|---:|---|
| The Monster Mailroom | 5 | 5 | 7 | 6 | 6 | **5** | Distinct creatures remain, but the dispatch infrastructure is mostly behind the panels. |
| Little Helpers Laboratory | 5 | 5 | 7 | 6 | 6 | **5** | Robots read as helpers; the oversized laboratory and equipment are difficult to see. |
| Heist Night | 4 | 4 | 7 | 6 | 4 | **4** | The skyline and tripwires are largely covered; the scene is 48,047 bytes. |
| The Chocolate Factory | 5 | 5 | 7 | 6 | 6 | **5** | Candy and factory scenery is obscured; repeated hats and small machine motifs carry too much of the identity. |
| The Lantern Woods Guild | 5 | 3 | 7 | 6 | 6 | **3** | Lanterns and cast suggest a guild, but the scene and cast are not strict pixel art. |
| The Coffee House Crew | 4 | 4 | 7 | 6 | 4 | **4** | The rendered setting reads mainly as people in panels; the scene is 44,037 bytes. |
| Tumbletown Rhyme Works | 5 | 5 | 7 | 6 | 6 | **5** | Character shapes are playful, but the distinctive crooked machinery is mostly hidden. |
| Starport Shipyard | 5 | 5 | 7 | 6 | 6 | **5** | The cast suggests science fiction; the planet, hangar, and cranes do not dominate the composition. |
| Critter Expedition Camp | 4 | 3 | 7 | 6 | 6 | **3** | Creatures read at thumbnail size, but camp scenery is obscured and the art is not strict pixel art. |
| Blockworks Foundry | 5 | 3 | 7 | 6 | 6 | **3** | Cubes and geometric figures signal construction, but the quarry is covered and the overall medium mixes smooth vector and pixel geometry. |
| The Cloudspring Baths | 4 | 5 | 7 | 6 | 6 | **4** | Small roof motifs and vessel-like attendants remain; the bathhouse and steam do not establish a convincing place. |
| Thimble Town | 4 | 5 | 7 | 6 | 6 | **4** | Repeated spool motifs suggest sewing, but the miniature scale and found-object setting are weak. |
| Clockwork Stargazers | 6 | 5 | 7 | 6 | 6 | **5** | The clockwork cast and repeated armillary motifs help, while the larger observatory is hidden. |
| Reef Town | 6 | 5 | 7 | 6 | 6 | **5** | Marine silhouettes and coral motifs are recognizable, but the underwater environment lacks visible depth. |
| Cozy Critter Village | 5 | 5 | 7 | 6 | 6 | **5** | Animal characters and tiny houses suggest comfort, but little village architecture survives in view. |

## Numbered adversarial findings

### 1. Major — The station panels conceal the artwork meant to define the worlds

**Evidence.** The generator paints `theme_art_backdrops.backdrop(...)` first, then paints six filled station `<rect>` elements over it. The main station fill has no opacity attribute, so it is opaque. See [build_theme_art.py:224](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py:224) and [build_theme_art.py:232](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py:232). The same scene is embedded in each generated thumbnail at [build_theme_art.py:279](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py:279).

The effect is visible across the rendered current thumbnails: Heist’s skyline, the café window, the shipyard planet, the bathhouse roofs and steam, and the field-camp tents are mostly lost behind the six panels. This is not merely a preference for more decoration: the concealed features are the generator’s principal genre cues.

**Recommendation.** Recompose the scene around protected functional regions. Put distinctive architecture in visible margins and shared circulation areas, or use carefully controlled openings and localized backplates. Verify the final composition with actual actors and labels before accepting the artwork.

### 2. Major — The three pixel themes do not meet the specified medium

**Evidence.** Lantern Woods uses rectangles described as pixel work, but its lantern halo uses opacity and its cobblestones use 18×10 rectangles with a one-unit stroke; the construction does not establish a consistent pixel grid or dithering pattern. See [theme_art_backdrops.py:109](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:109). Critter Camp’s purported pixel tents are smooth diagonal polygons, and its campfire uses ellipses and circles at [theme_art_backdrops.py:191](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:191). Blockworks uses smooth isometric vector paths at [theme_art_backdrops.py:214](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:214).

Across these worlds, the shared character generator adds gradients, curved arms and faces, elliptical shadows, and smooth geometry; see [build_theme_art.py:58](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py:58). The shared scene also uses rounded panels and 1.5-unit strokes. These are concrete departures from the brief’s strict grid, stepped geometry, dithering, and zero-mixel criteria.

**Recommendation.** Specify one logical pixel grid and palette per pixel theme; redraw scenery, casts, props, and effects on that grid. Render at integer scale with pixel-preserving sampling, then inspect scene-size and enlarged exports for fractional edges, mixed pixel sizes, smoothing, and actual patterned dithering.

### 3. Major — Heist Night and The Coffee House Crew exceed the requested scene budget

**Evidence.** Current manifest-verified scene sizes are **48,047 bytes** for [Heist Night](/home/flyfission/projects/Control-Rod/apps/web/public/floor-themes/midnight-bureau/assets.json) and **44,037 bytes** for [The Coffee House Crew](/home/flyfission/projects/Control-Rod/apps/web/public/floor-themes/corner-cafe/assets.json), both above the brief’s `<30KB` limit regardless of whether KB is interpreted as decimal or binary. Their generators emit many individual skyline-window and brick `<rect>` elements at [theme_art_backdrops.py:71](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:71) and [theme_art_backdrops.py:141](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:141).

The repository checker passes these files because its limits are different: it checks a 1 MiB per-asset ceiling, a thumbnail ceiling, and a pack total; it does **not** enforce the review brief’s per-scene 30KB ceiling or per-character 2KB ceiling. See [check_theme_assets.py:13](/home/flyfission/projects/Control-Rod/tools/check_theme_assets.py:13) and [check_theme_assets.py:82](/home/flyfission/projects/Control-Rod/tools/check_theme_assets.py:82).

**Recommendation.** Remove hidden geometry first, then simplify or consolidate visible repeated geometry and enforce the review limits explicitly in an automated gate. Recheck the resulting artwork and hashes. All ninety current characters were below 2,000 bytes in this review.

### 4. Major — The shared layout overwhelms medium-specific composition

**Evidence.** Every scene receives the same station footprints, promenade, desk-shaped paths, and six pairs of faint ellipses; only corner radius, colors, and a repeated vignette vary substantially inside the panels. See [build_theme_art.py:20](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py:20) and [build_theme_art.py:226](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py:226). The contact sheet consequently reads as fifteen variations on one dashboard. A repeated per-station motif—for example, the same lantern in each Lantern Woods station or armillary in each Clockwork station—is not a substitute for a legible setting.

**Recommendation.** Preserve the semantic station coordinates while giving each scene a distinct visible spatial concept, silhouette, material treatment, and lighting hierarchy. Use station-specific visual cues rather than six copies of one decoration, and test genre recognition with titles and labels hidden.

### 5. Major — Several promised environments are represented by obscured or generic fragments

**Evidence and recommendations.**

- **Monster Mailroom and Little Helpers Laboratory:** transfer tubes, door clamps, chalkboard, and condenser are authored behind panels ([backdrops:20](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:20), [backdrops:43](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:43)). Expose an original parcel-routing system and oversized laboratory equipment.
- **Heist Night and Coffee House Crew:** skyline, arched window, light cones, and couch are largely hidden or compressed into margins ([backdrops:65](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:65), [backdrops:138](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:138)). Create readable, original planning-office and café silhouettes with depth.
- **Chocolate Factory and Tumbletown:** lollipop trees, candy piping, chimneys, and conveyors are present in source but mostly concealed ([backdrops:92](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:92), [backdrops:157](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:157)). Show confectionery-making machinery and an original improbable mechanism in usable, visible areas.
- **Starport, Critter Camp, and Blockworks:** the planet, tents, and quarry blocks are similarly behind panels ([backdrops:173](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:173), [backdrops:191](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:191), [backdrops:214](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:214)). Give each a recognizable working environment, not just a themed cast.
- **Cloudspring, Thimble Town, Clockwork, Reef Town, and Cozy Critter Village:** the source contains rooflines, spools, gears, coral, and a tree-root arch ([backdrops:236](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:236), [backdrops:252](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:252), [backdrops:273](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:273), [backdrops:294](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:294), [backdrops:310](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py:310)). Recompose each around visible scale, light, and architecture: bathing, miniature craft, an observatory, underwater space, and a village respectively.

These are genre-readability findings, not allegations that the underlying ideas are impermissible.

### 6. Major — Originality and distribution are not established for the current bundles

**Evidence.** The current repository originality scan passed, and the generator declares its geometry original. That is useful evidence, but the project’s own rules require full-size cast comparison and an assessment of combined visual clues before release; see [originality.md:47](/home/flyfission/projects/Control-Rod/docs/overlay-themes/originality.md:47) and [originality.md:49](/home/flyfission/projects/Control-Rod/docs/overlay-themes/originality.md:49). The current [release manifest](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/themes/release-manifest.json) is empty, and the existing handoff says human art and distribution review remained pending at [ship.md:7](/home/flyfission/projects/Control-Rod/.nuclear/changes/overlay-themes/ship.md:7).

I did not conduct the required full-size side-by-side comparison against relevant works or establish independent rights provenance for every element. I found no specific copied mark or protected likeness in this review; that narrower observation cannot prove a zero-risk boundary.

**Recommendation.** Conduct and document the prescribed independent, full-size expression review for each current cast and scene, paying particular attention to accumulated clues, costumes, props, and layouts. Bind the human art and distribution decision to the exact title, version, and asset hashes. Retain the current development status until that review is complete.

### 7. Major — Current ergonomics and performance have not been demonstrated against the new assets

**Evidence.** The renderer places the scenery as a noninteractive background and puts station labels and actors in separate layers ([FloorScene.tsx:45](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/FloorScene.tsx:45), [FloorScene.tsx:78](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/FloorScene.tsx:78)); label backplates and actor stacking are defined in [floor.css:158](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/floor.css:158). This is positive structural evidence, but static thumbnail inspection cannot establish that live labels, focus rings, badges, or crowded actors remain clear at every relevant viewport and state.

The retained 30-second reference performance measurements were bound to an earlier commit and build digests, as recorded in [verification.md:22](/home/flyfission/projects/Control-Rod/.nuclear/changes/overlay-themes/verification.md:22). They do not measure these modified scene assets. A browser launch for this review was blocked because Playwright attempted to create a temporary directory on the read-only filesystem.

**Recommendation.** Run the current hash-bound build through the shared semantic fixture with all six stations populated, long labels, overflow, office markers, focus, selection, and run badges. Inspect Full, Quiet, Still, grayscale, narrow viewports, keyboard interaction, and zoom. Measure frame intervals, activation, and switching on the stated reference configuration and report the actual distribution and test conditions. Define “instant” and the 60fps acceptance measure explicitly; neither can be established from SVG byte size alone.

### 8. Minor — Passing checks should not be mistaken for complete rubric conformance

**Evidence.** This review independently verified SHA-256 and byte counts for **210 manifest entries** across fifteen packs, XML-parsed those assets, and confirmed that all fifteen current scenes reproduce the bytes generated in memory from the current generator and catalog. `tools/check_theme_assets.py` and the repository originality check passed. The web TypeScript compiler also passed with `--noEmit`; the pack files use `satisfies ThemePackV1`, for example [lanternwood-guild.ts:1](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/themes/packs/lanternwood-guild.ts:1).

Those checks do not establish visual quality, legal clearance, live interaction, 60fps rendering, or zero failures in the current Vitest and lint suites. I did not run those suites in this read-only review.

**Recommendation.** Keep distinct evidence rows for integrity, schema/type checking, scene and character budgets, visual review, interaction/accessibility, performance, and rights review. Run the current applicable test and lint commands in a writable test environment and retain their outputs and build identity.

## Top improvements required before 10/10

1. **Fix the compositing order and layout first.** Make the distinctive world architecture visible while retaining quiet, protected functional areas.
2. **Give every world a recognizable composition at actual scene size.** Test without names or labels and revise ambiguous settings, especially Heist, Coffee House, Cloudspring, Thimble Town, and Critter Camp.
3. **Rebuild the three pixel themes as coherent pixel art.** Apply a consistent grid, stepped silhouettes, deliberate dithering, and pixel-preserving scaling to scenes, characters, props, and effects.
4. **Bring both oversized scenes below 30KB and automate the brief’s exact asset limits.** Remove obscured geometry before optimizing visible detail.
5. **Complete current-build interaction, accessibility, test, and performance verification.** Use populated fixtures and retain results tied to the exact assets delivered.
6. **Complete the project’s human originality and distribution review.** Record decisions against each current hash bundle; automated originality checks alone do not authorize a 10/10 originality score.
