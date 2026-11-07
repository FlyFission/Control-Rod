# Adversarial Review: Working World Overlay Themes (15 packs)

## 1. Executive Verdict

**No theme reaches 10/10, and none comes close to a unanimous pass.** The plumbing is good. All 210 SVGs match their `assets.json` SHA-256 digests, the manifests are complete, and nothing contains `<script>`, `<text>`, `<image>` or external references. The artwork is the weak part. Every scene is stamped from one template in [build_theme_art.py](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py) (`scene()`, line 215). That template draws six opaque station panels and an opaque promenade on top of the world-specific backdrop from [theme_art_backdrops.py](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py). **By draw order and coordinates, most of the hand-authored backdrop is painted over and never seen.** The three "pixel" worlds contain no pixel craft. They use smooth Béziers, gradients, rounded corners and fractional strokes, while the source comments claim "AUTHENTIC 16-BIT". Two scenes break the byte budget, and one theme (Heist Night) fails a contrast check. Two worlds (Coffee House, Chocolate Factory) assemble clue clusters that `originality.md` warns about.

**What I did not verify.**
- I read geometry and did not render any SVG, so the occlusion findings come from draw order and coordinates, not screenshots.
- The Python checkers (`check_originality.py`, `check_theme_assets.py`) and vitest/lint need approval that this non-interactive session cannot give, so I did not run them.
- I did no frame-rate profiling.

The "stranger test" for cast likeness also needs a human looking at the rendered art.

## 2. Scorecard Matrix

Scores are my judgment from the evidence above, not tool output. Criteria: **G** Genre Resonance, **C** Craftsmanship, **O** Cleanroom IP, **E** Station Ergonomics, **T** Technical Conformance. Overall is the unrounded mean.

| # | Theme (pack id) | G | C | O | E | T | Overall |
|---|---|---|---|---|---|---|---|
| 1 | The Monster Mailroom (`creature-dispatch`) | 5 | 5 | 8 | 7 | 8 | 6.6 |
| 2 | Little Helpers Laboratory (`pocket-lab`) | 5 | 5 | 8 | 7 | 8 | 6.6 |
| 3 | Heist Night (`midnight-bureau`) | 3 | 4 | 8 | 6 | 4 | 5.0 |
| 4 | The Chocolate Factory (`confectionery-works`) | 5 | 5 | 6 | 7 | 8 | 6.2 |
| 5 | The Lantern Woods Guild (`lanternwood-guild`, pixel) | 4 | 3 | 8 | 6 | 8 | 5.8 |
| 6 | The Coffee House Crew (`corner-cafe`) | 3 | 4 | 5 | 7 | 4 | 4.6 |
| 7 | Tumbletown Rhyme Works (`tumbletown-workshop`) | 5 | 5 | 8 | 7 | 8 | 6.6 |
| 8 | Starport Shipyard (`orbital-shipyard`) | 4 | 5 | 8 | 7 | 8 | 6.4 |
| 9 | Critter Expedition Camp (`wildlight-camp`, pixel) | 3 | 2 | 8 | 7 | 8 | 5.6 |
| 10 | Blockworks Foundry (`voxel-foundry`, pixel) | 3 | 3 | 7 | 7 | 8 | 5.6 |
| 11 | The Cloudspring Baths (`cloudspring-bathhouse`) | 4 | 4 | 8 | 7 | 8 | 6.2 |
| 12 | Thimble Town (`button-and-spool`) | 5 | 4 | 8 | 7 | 8 | 6.4 |
| 13 | Clockwork Stargazers (`clockwork-observatory`) | 4 | 4 | 8 | 7 | 8 | 6.2 |
| 14 | Reef Town (`coral-commons`) | 4 | 4 | 8 | 7 | 8 | 6.2 |
| 15 | Cozy Critter Village (`meadow-post`) | 4 | 4 | 8 | 7 | 8 | 6.2 |
| | **Catalog mean** | 4.1 | 4.1 | 7.7 | 6.9 | 7.5 | **6.1** |

**Pass count at 10/10 across all five criteria: 0 of 15.**

I capped T at 8 everywhere because vitest/lint were not run. I capped O at 8 because the originality checker and the human cast review were not run, and `NOTICE.txt` itself says "human art/distribution review remains pending".

## 3. Numbered Adversarial Findings

### Critical

**1. The world backdrops are mostly hidden under the station panels and promenade (all 15 themes).**
- **Evidence:**
  - `scene()` draws, in order: sky, backdrop, promenade (line 226), then six opaque station rects.
  - Each station rect is `fill=mix(a,.32)` with no opacity. Together they cover x 20 to 980 and y 20 to 260, and y 340 to 580.
  - Visible backdrop is therefore limited to the 20px outer margin, the 20px gutters, and the band y 260 to 340. The promenade strip at y 286 to 316 is also opaque and covers the middle of that band.
  - Heist Night: the skyline spans y 270−h (20 to 120) down to 270 ([theme_art_backdrops.py:68-77](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py)) and sits entirely inside the panels. The window grid is hundreds of invisible `<rect>`s.
  - Coffee House: the brick wall (lines 141-144) and the arched window at x 410 to 590, y 40 to 240 sit entirely under the "site" panel (x 340 to 660, y 20 to 260). The brick masonry accounts for most of its 44KB.
  - Critter Camp: the tents (x 120 and 800, y 60 to 160) and crates (y 140) sit under panels.
  - Blockworks: the voxel hills (y under 110) and the conveyor with its cubes (y 286 to 304) are under the panels or the promenade.
  - Lantern Woods: the cobbles (y 290 to 308) are covered by the promenade.
  - Starport: the starfield (y under 250), the planet limb and the gantry (y 32 to 52) sit under panels.
  - Clockwork: the gear train and armillary rings sit under panels.
- **Impact:** Genre recognition (G) and craftsmanship (C) are scored on what ships, and what ships is the template plus a small corner vignette. Hundreds of kilobytes of invisible geometry also hurt T.
- **Recommendation:**
  - Either make the panels translucent or frameless so the scenery shows through, or move the world art to the visible zones: the gutters, the 80px band, and a frame around the panels.
  - Render all 15 scenes at 1000×600 and confirm each world is recognizable from the visible pixels alone.
  - Delete any backdrop geometry that is fully occluded.

**2. The three "pixel" themes are not pixel art (Lantern Woods, Critter Camp, Blockworks).**
- **Evidence:**
  - There is no `shape-rendering="crispEdges"` in any scene (0 occurrences across all 15 files).
  - There is no dithering anywhere. The "dithered halos" at [theme_art_backdrops.py:131-132](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py) are two stacked `opacity=".15"` and `.08` rects.
  - The Lantern Woods scene file has 169 curve commands, 6 gradient references and fractional coordinates.
  - The shared template draws pixel worlds 4 and 8 with `rx=26` rounded panels (`build_theme_art.py:233`), plus a soft offset shadow at opacity .35 and an ambient radial gradient.
  - Characters are smooth vectors. Each uses `linearGradient`, ellipse eyes, a Bézier smile and 2 to 5px strokes ([build_theme_art.py:53-56](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py), [theme_art_casts.py:130-135](/home/flyfission/projects/Control-Rod/tools/theme_art_casts.py)). Mixed stroke widths of 1, 1.5, 2 and 3 are the mixels the rubric forbids.
  - Critter Camp's tents are plain polygons, its fire is circles and ellipses, and its crates have a 1.5px stroke.
  - Blockworks' iso cubes (lines 217-223) are the only grid-like construction, and they sit under the panels (finding 1).
  - The source comments shout "AUTHENTIC 16-BIT PIXEL ART" at lines 110, 192 and 215, which the output does not support.
- **Recommendation:**
  - Build a real pixel path: integer grid, fixed palette, `crispEdges`, ordered-dither tiles as `<pattern>`, and stepped sprites with no curves, gradients or fractional strokes.
  - Draw pixel panels and characters separately from the vector template.
  - Add a lint that fails on `Q`, `C`, `A`, gradients, fractional values and non-grid coordinates for the pixel packs.

### Major

**3. Two scenes break the 30KB scene budget, and the repo gate cannot catch it.**
- **Evidence:** `midnight-bureau` scene is 48,047 bytes and `corner-cafe` scene is 44,037 bytes. Next largest is `lanternwood-guild` at 21,982. Heist's thumbnail is 54,363 bytes, which is the largest in the catalog.
- [check_theme_assets.py:14,64,82,85](/home/flyfission/projects/Control-Rod/tools/check_theme_assets.py) only enforces 1 MiB per asset, 100 KiB per thumbnail and 1 MiB per pack. The brief's 30KB and 2KB limits are not tested anywhere. (All characters are under 2KB, with a maximum of 1,394 bytes, so that limit holds today.)
- **Recommendation:** Add scene (under 30KB) and character (under 2KB) assertions to the checker. Cut the hidden window grid and brick courses (finding 1). Replace them with `<pattern>`-based fills.

**4. Heist Night's palette and tokens fail on contrast and genre.**
- **Evidence:**
  - `tokens.accent` is `#735743` on backdrop `#101c27` ([midnight-bureau.ts:17](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/themes/packs/midnight-bureau.ts)). By my WCAG calculation that is about 2.6:1, below the 3:1 non-text minimum. Every other pack's accent is lighter.
  - `surface` `#121e2a` is nearly identical to `backdrop` `#101c27`, so there is no separation.
  - The code comment promises "faint cyan laser tripwires" ([theme_art_backdrops.py:85](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py)), but `c` is that dark brown, so the lasers render brown.
  - The red beacon is hardcoded `#ff4444` (line 81).
  - The scene is a flat, evenly lit blue-grey. A "midnight casino/heist" needs strong lighting contrast and spotlight pools.
- **Recommendation:** Set the accent from a lighter palette slot, differentiate surface from backdrop, take laser and beacon colors from the palette, and add real lighting (vault glow, searchlight pools) where it will be visible.

**5. The Coffee House Crew assembles the clue cluster `originality.md` warns about.**
- **Evidence:**
  - [originality.md](/home/flyfission/projects/Control-Rod/docs/overlay-themes/originality.md) says the café world "avoids a fixed group size and signature furniture".
  - The backdrop draws an "Iconic tufted plush velvet couch" front and centre ([theme_art_backdrops.py:153-155](/home/flyfission/projects/Control-Rod/tools/theme_art_backdrops.py)). The comment itself calls it iconic.
  - The scene also has exposed brick, a big arched window and pendant lamps. The cast is exactly six everyday-clothed adults, one per station.
  - Each of those is generic alone. Together they decode to one famous sitcom set.
- **Recommendation:** Remove the couch and the central-window-plus-brick composition, vary the cast count and look, and replace the "iconic" comment. Run the stranger test visually before any release.

**6. The Chocolate Factory leans on candy-world clichés and uniform cast outfits.**
- **Evidence:**
  - Backdrop: candy-swirl hills, "giant spiral lollipop trees" (lines 98-102) and "looping brass syrup pipes with glass globes" (lines 104-107).
  - Cast: `extras()` gives all six characters the same white toque with a colored band ([theme_art_casts.py:218-224](/home/flyfission/projects/Control-Rod/tools/theme_art_casts.py)). That is matching outfits, which `originality.md` explicitly says to avoid.
  - The lollipop trees and syrup pipes are mostly occluded anyway (finding 1).
- **Recommendation:** Vary the headwear and silhouettes. Pick one distinctive invented detail and drop the generic candy-land set dressing.

**7. All 15 worlds share one skeleton, which flattens genre identity.**
- **Evidence:**
  - Identical station geometry, header plate, desk plate, three spotlight ellipses per station and indicator dots ([build_theme_art.py:233-243](/home/flyfission/projects/Control-Rod/tools/build_theme_art.py)). Only a 3-way `rounding` switch and the palette change.
  - Faces, legs and handheld tools are a shared "house style" ([theme_art_casts.py:5-6](/home/flyfission/projects/Control-Rod/tools/theme_art_casts.py), `build_theme_art.py:112` tool set). Eyes, smile and tools repeat across all 15 casts.
  - The only per-world visible art is a roughly 40×65px vignette (`vignette()`, `build_theme_art.py:242`) at a fixed corner, plus the promenade accent.
  - Blank the palette and most worlds would be hard to tell apart in the visible zones.
- **Recommendation:** Give each world its own station panel treatment (shape, trim, texture), its own faces and tools, and let the scenery frame the stations (see finding 1).

**8. The corner vignette collides with the third-column actor.**
- **Evidence:** The vignette sits at `(x+w-42, y+22)` and extends about 65px down. Actors in column 3 are centered at `x+0.833w`. They are 74 to 116px wide, `translate(-50%,-35%)`, at `y+95` ([layout.ts:25-26](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/layout.ts), [floor.css:196-205](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/floor.css)). That puts the card top at about y+67 and overlaps the vignette by roughly 20px. Scenery is under the card, so it is not concealed, but busy art directly behind a card and run badge hurts scanning. Row-two actors also sit over the decorative desk plate.
- **Recommendation:** Move vignettes out of the actor lanes (for example into the header plate beside the label) and verify with real hit boxes, as the spec step 210 requires.

**9. Criterion 5 is partly unverified.**
- **Evidence:** I could not run `check_theme_assets.py`, `check_originality.py`, vitest or lint (all need approval). I confirmed by shell that SHA-256 and byte counts match for all 210 files. The spec also calls for contrast, grayscale and Full/Quiet/Still checks (lines 210 and 212), and I saw no evidence of them.
- **Recommendation:** Run and attach the output of the full verification set before any 10/10 claim. Per repo rule 5, numbers like scores should come from tools with recorded inputs.

### Minor

**10. The runtime does not verify the hash against the bytes.** [registry.ts:88](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/themes/registry.ts) only checks that `sha256` matches `/^[a-f0-9]{64}$/`. Integrity is enforced only by the build-time checker. Consider a subresource-integrity check on load.

**11. Overclaiming source comments.** "AUTHENTIC 16-BIT PIXEL ART" (backdrops lines 110, 192), "AUTHENTIC ISOMETRIC 3D VOXEL" (line 215) and "Iconic couch" (line 153) contradict the output and the originality rules. Delete or correct them before the repo is public.

**12. Hardcoded colors bypass the palette.** `#ff4444` at backdrops lines 81 and 323 (Heist beacon, Meadow mailbox flag), chalkboard `#1b3628` (line 51), and station-label chips in [floor.css:174-196](/home/flyfission/projects/Control-Rod/apps/web/src/features/floor/floor.css) use fixed colors regardless of theme.

**13. The pixel requirement lives only in the brief.** The catalog spec has no "pixel" or "dither" requirement (grep returns nothing), and the three pixel packs are tagged `Adventure`, not pixel. Add the requirement to the spec so the checker can enforce it.

**14. Review targets uncommitted state.** Git shows 124 modified or deleted paths. Regenerated hashed assets replaced the committed ones, so HEAD manifests and release records will not match the files reviewed here. Commit, then re-verify against `release-manifest.json`.

**15. Provenance wording.** Every asset carries `creator: "Original procedural vector illustration (Codex, Claude Code)"` and `rightsBasis: "original"`. That is honest about how it was made, but the legal status of AI-generated output is not settled. `check_public_claims.py` should cover any public "100% original" wording.

## 4. Top Improvements Required Before a Unanimous 10/10

1. **Fix the layering (finding 1).** Make every world's scenery visible: translucent or frameless panels, or relocate the art to the visible zones. Re-render all 15 and review them at scene size.
2. **Build a real pixel pipeline for the three pixel worlds (finding 2).** Integer grid, `crispEdges`, a fixed palette, ordered-dither patterns, stepped sprites, and a lint that rejects curves and gradients.
3. **Get Heist Night and Coffee House under 30KB (finding 3).** Replace hidden window and brick geometry with patterns, and add 30KB/2KB assertions to `check_theme_assets.py`.
4. **Repair Heist Night's tokens and lighting (finding 4).** Accent at least 3:1, surface distinct from backdrop, palette-driven lasers and beacon.
5. **Remove the Coffee House couch and brick-and-arch composition, and vary the Chocolate Factory hats and set dressing (findings 5 and 6).** Then do the visual stranger test for all 15 casts.
6. **Break the template (finding 7).** Per-world panel treatment, faces and tools; vignettes moved out of the actor lanes (finding 8).
7. **Run and record the full verification set (finding 9):** both Python checkers, vitest, lint, and the contrast, grayscale and Quiet/Still checks. Commit, then re-hash against the release manifest (finding 14).
8. **Clean up the code comments, hardcoded colors and runtime hash check (findings 10 to 12).**

I changed nothing in the repository. I only ran read-only shell commands (file listing, size and hash checks, grep).
