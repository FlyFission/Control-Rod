I'll start by reading the review brief and the theme materials it points at, then score each overlay against the 10/10 rubric.The brief is a read-only audit against a 10/10 bar. I'll load the spec, originality rules, generators, and all 15 theme packs before scoring anything.The generators and a few exported characters already show a shared mannequin painted on top of each cast. I'll measure every asset and rasterize the scenes so the scores rest on the pictures, not the comments.None of the 15 themes is a 10. The highest gate score is 5, and the three pixel themes sit at 3. The packs are valid, hashed, and small. The pictures are one dashboard scaffold, one pasted character rig, and a corner icon.

Raster checks used the shipped SVGs at 1000×600, plus the ninety-character sheet. `tools/check_theme_assets.py` passed. `tools/test_check_theme_assets.py` passed 10 tests. Theme vitest passed 18 tests. `tools/check_originality.py` failed on two review documents.

## Scorecard

Overall is the lowest of the five scores. The acceptance bar is 10 on every column.

| Theme | Genre | Craft | IP | Ergonomics | Technical | Overall |
|---|---:|---:|---:|---:|---:|---:|
| The Monster Mailroom (`creature-dispatch`) | 6 | 5 | 9 | 6 | 8 | 5 |
| Little Helpers Laboratory (`pocket-lab`) | 5 | 5 | 9 | 7 | 8 | 5 |
| Heist Night (`midnight-bureau`) | 6 | 4 | 9 | 4 | 8 | 4 |
| The Chocolate Factory (`confectionery-works`) | 6 | 5 | 8 | 6 | 8 | 5 |
| The Lantern Woods Guild (`lanternwood-guild`) | 4 | 3 | 9 | 7 | 8 | 3 |
| The Coffee House Crew (`corner-cafe`) | 6 | 4 | 9 | 4 | 8 | 4 |
| Tumbletown Rhyme Works (`tumbletown-workshop`) | 4 | 4 | 9 | 4 | 8 | 4 |
| Starport Shipyard (`orbital-shipyard`) | 6 | 5 | 9 | 6 | 8 | 5 |
| Critter Expedition Camp (`wildlight-camp`) | 3 | 3 | 9 | 7 | 8 | 3 |
| Blockworks Foundry (`voxel-foundry`) | 4 | 3 | 9 | 7 | 8 | 3 |
| The Cloudspring Baths (`cloudspring-bathhouse`) | 4 | 4 | 8 | 7 | 8 | 4 |
| Thimble Town (`button-and-spool`) | 5 | 4 | 9 | 7 | 8 | 4 |
| Clockwork Stargazers (`clockwork-observatory`) | 6 | 5 | 9 | 7 | 8 | 5 |
| Reef Town (`coral-commons`) | 6 | 5 | 9 | 7 | 8 | 5 |
| Cozy Critter Village (`meadow-post`) | 5 | 4 | 8 | 6 | 8 | 4 |

## Findings

**1. Critical. The three pixel themes are smooth vector diagrams.**

The Lantern Woods Guild, Blockworks Foundry, and Critter Expedition Camp are the rubric's pixel set: one grid, 16-bit dither, stepped geometry, no mixels. The generator comments claim that. The files do the opposite.

`tools/theme_art_backdrops.py` lines 120–141 label Lanternwood "STRICT 16-BIT PIXEL ART" and then emit a 32×16 canopy, 12px columns at x=324 and x=664, and alpha halos (`fill-opacity=".15"` and `".08"`) in place of dither. The shipped scene (`apps/web/public/floor-themes/lanternwood-guild/scene.e3d5f6f0dd47.svg`, line 1) contains `<rect x="1000" y="16" width="16" height="12">`, which starts on the viewBox edge and runs off it, plus `<ellipse cx="393.3333333333333" ...>`. `tools/build_theme_art.py` line 233 gives this world `rx="26"` station plates, a sky gradient, and quadratic leaves (`Q-14 -14 0 -25.2` in the same scene file). At 1000×600 the picture is six rounded dark panels, a thin green frame, and the same smooth lantern in every corner.

The cobble stagger is dead. Lines 139–141 step `cx` by 24 and then use `cx % 3`. Every multiple of 24 is divisible by 3, so every cobble in the scene file is `y="296"`.

Critter Expedition Camp (`tools/theme_art_backdrops.py` lines 198–211) is two triangle tents and a campfire of overlapping rects at x=472 and x=474. The scene is 9,730 bytes. At full size it is six empty panels, a repeated cabin stamp, two specks, and a dot on the center line.

Blockworks Foundry (lines 213–229) draws anti-aliased isometric facets along the promenade. There is no pixel grid and no dither. `character-0.19ba1edf0185.svg` line 1 puts a gradient, an `<ellipse>`, and quadratic arms on the cube.

Recommendation: redraw these three worlds on one integer grid, including characters and station chrome. Drop gradients, curves, fractional coordinates, rounded plates, and opacity halos. Use real dither. Or stop calling them pixel themes. Comments that say "strict 16-bit" should match the bytes.

**2. Major. One mannequin is pasted onto all ninety characters, and the uniqueness test cannot see it.**

`tools/theme_art_casts.py` lines 5–6 say faces, legs, and tools stay a shared house style. `tools/build_theme_art.py` lines 64–68 always draw the shadow, the leg path `M47 93l-5 17...`, the arm path `M38 70Q20 73 27 91`, the eyes at `cy="57"`, the smile `M57 69q8 6 15-1`, and the chisel `M91 83l17-8 7 18-17 7z`. Line 168 concatenates those parts after the world body. `extras()` returning `''` only clears the accessory.

Counted across the shipped character files: the default arms are on 84 of 90 characters. The default eyes, smile, and chisel are on every non-human world, including all six Chocolate Factory, Baths, Foundry, Camp, Village, and Observatory characters. Human worlds (Heist, Café, Thimble Town, and part of Lanternwood) swap in a second shared rig: legs `M45 87l-4 24...` and eyes at `cy="41"`, and they still keep the 10px curved arms.

Concrete collisions, all on line 1 of the named file:

- `voxel-foundry/character-0.19ba1edf0185.svg` draws the isometric cube, then humanoid legs, 10px arms, oval eyes, a smile, and the chisel.
- `meadow-post/character-5.5fcefa3b045c.svg` draws the hedgehog spikes, then the same legs, arms, eyes, smile, and chisel.
- `coral-commons/character-0.14e459c56e25.svg` clears legs and arms in the world-13 branch, then still paints the house smile and the chisel onto the octopus.
- `confectionery-works/character-0.ae802949953f.svg` paints the candy body and a separate hat, then the same legs, arms, face, and chisel.
- `lanternwood-guild/character-1.44ae608b18bd.svg` is the horned smith. The dead branch at `tools/build_theme_art.py` lines 114–116 leaves eyes at `cy="52"` and a headset path on a body that has no head there.

`tools/test_check_theme_assets.py` lines 58–76 only hash elements inside `<g id="shape-N">`. The test is green while the limbs outside that group match across worlds. The contact sheet shows one face and one clipboard on almost every cast.

Recommendation: when `body()` returns a body, do not draw the house limbs. Give each variant its own face, arms, legs, and prop from the catalog cast list. Keep a single foot line at y=114 by drawing the body down to it. Assert the full character bytes, not only the shape group.

**3. Major. All fifteen scenes are the same scaffold. The world is a repeated corner stamp.**

`tools/build_theme_art.py` `scene()` (lines 215–247) paints one sky gradient, one radial wash, one promenade, six plates at `fill-opacity=".4"`, one header bar, one desk trapezoid, three dots, and then `vignette()` once per station (line 242). The vignette is the same drawing six times. Native rasters of Lanternwood, Camp, Foundry, Baths, Café, and the Factory all show that stamp in the top-right of every panel and empty oval slots everywhere else.

There is no architectural perspective and no motivated light. Illustrative themes in the rubric need both. A stranger can guess "candy conveyor," "night city," "gears," or "reef" from the gutter. They cannot see a guild inside a great tree, a field camp, a voxel quarry, a bathhouse, or a crooked rhyme town. Catalog cast anatomy is also missing in several files: Camp (`tools/theme_art_casts.py` lines 161–168) is six blobs, not a lantern-backed beetle, a leaf-frilled quadruped, a reed-winged bird, and a coral-antlered crawler. Baths (lines 179–186) are coat shapes, not crane, kettle, basin, reed, towel, and lantern silhouettes.

Recommendation: keep the six plates flat and empty. Put a real, different silhouette in the gutters and the deep background for each world. Delete the repeated corner stamp, or draw six different props that stay inside the 32px header and clear of the 3×2 slot grid (`apps/web/src/features/floor/layout.ts` lines 23–26). Draw the catalog anatomies as the actual paths.

**4. Major. Scenery is drawn inside the station rectangles and shows through the plates.**

Plates are `fill-opacity=".4"` (`tools/build_theme_art.py` line 234). Task text and run badges survive because they are opaque HTML chips (`apps/web/src/features/floor/floor.css` lines 174–198 and 264–277) painted above the image. Avatars are 54px and transparent (lines 229–240), so anything in the station rect shows through the glyph. These intrusions are visible at 1000×600:

- Heist Night. The skyline path in `tools/theme_art_backdrops.py` lines 73–86 runs towers down to y=270. Upper stations occupy y=20–260. The tower `L440 270 440 50 510 50 510 270` covers the site station center (slot x=500). The raster shows those towers inside the top three panels.
- The Coffee House Crew. Line 153, `M430 268V140q70-55 140 0v128z`, is an arched window inside site (`x=340–660`, `y=20–260`). The raster shows it filling the middle of that panel, on top of the center slots.
- Tumbletown. Lines 171–174 place chimneys at x=160, 500, and 840, rising from y=270 to about y=160–180, through the upper three panels and their desk bars. The yellow rail crosses the site desk. The raster matches.
- Starport. Lines 187–188, `M720 0q140 60 280 160`, lay the planet limb over archive (`x=680–980`). The gantry (lines 190–192) crosses the header band.
- Monster Mailroom. Clamps at lines 29–32 sit at y=40, height 36, inside the upper panels. Full-height tubes at x=325–345 and x=665–685 (lines 34–40) cut verify (`x=20–360`) and bench (`x=660–980`), because the lower row gutters are not the upper ones.

Recommendation: clip backdrop geometry to the complement of the six station rects. Retest with the slot centers from `layout.ts` marked. Heist towers, the café window, and the Tumbletown chimneys have to leave the panels before those three themes can move on ergonomics.

**5. Major. The originality checker fails in this tree.**

`tools/check_originality.py` exits 1. The hits are `docs/overlay-themes/reviews/argon.md` (lines 16, 132, 142, 188, 190, 242) and `docs/overlay-themes/reviews/SYNTHESIS.md` (lines 30 and 43). Theme sources, pack files, and SVGs are absent from the hit list. `docs/overlay-themes/originality.md` forbids franchise names anywhere in the repo, including internal notes. The denylist stores hashes only, so this report does not repeat the phrases.

The drawings themselves stay on the allowed side of the written clues:

- The Chocolate Factory scene (backdrop lines 102–118) is pipes, hills, and lollipops. There is no ticket, no river boat, and the six outfits in `extras()` (casts lines 223–232) are not one matching uniform.
- The Cloudspring bridge (backdrop lines 242–243) is a jade timber rect, `mix(a, .6)`, not a red arched gate. Pagoda eaves are a thin gold strip at y≈8–30. The current picture does not reproduce a film entrance. It also does not read as a bathhouse, which is finding 3.
- Meadow mail flags are a 6×3 rect of `#ff4444` (line 311). That is a generic flag, not a copied villager.

Recommendation: delete the denied phrases from those two review files and re-run the checker until it is clean. Keep the Chocolate Factory free of tickets, a chocolate river, and matching small workers. Keep the bath bridge off a red arched gate.

**6. Minor. The Café is tagged Adventure.**

`apps/web/src/features/floor/themes/catalog.ts` lines 128–129 set `corner-cafe` `moodTags` to `["Adventure"]`. The catalog spec, section 6, defines that world as a cozy neighborhood café. The picture is brick, a window, and plants.

Recommendation: set the mood tag to the calm/domestic value used by the other quiet worlds.

**7. Minor. The byte gate does not enforce the rubric budgets, and two colors sit outside the palettes.**

`tools/check_theme_assets.py` lines 14 and 64 reject only at 1 MiB. The rubric caps are 30KB per scene and 2KB per character. Current files comply: scenes are 9,730–19,440 bytes (largest is Lanternwood at 19,440), characters are 919–1,338 bytes (largest is Clockwork). A later regression past 30KB would still pass this gate. SHA-256 manifests match the pack files and the bytes on disk. Theme vitest (`pack-conformance.test.ts`, `registry.test.ts`) passed 18 tests. A frame-time run and a full lint run were not done.

`#ff4444` is hardcoded for Heist beacons (`theme_art_backdrops.py` line 90) and Meadow flags (line 311). Every pack sets `tokens.ink` and `tokens.focus` to `#ffffff` (`tools/build_theme_art.py` line 305). Live labels do not use those tokens.

Recommendation: fail the asset gate above 30KB for a scene and 2KB for a character. Pull the red marks from each world's palette.

## What has to change before any theme is a 10

1. Strip the shared mannequin out of `character()` and draw each catalog cast member's own face, limbs, and tool. Extend the geometry test to the whole SVG.
2. Redraw Lanternwood, Camp, and Foundry as actual pixel art on one grid, characters included, or remove them from the pixel bar.
3. Rebuild each scene so the world is readable from the gutters and the background, with flat empty station interiors. Remove the six identical corner stamps.
4. Move the Heist towers, the Café window, and the Tumbletown chimneys out of the station rects, then recheck all six slot centers.
5. Clear the originality-checker hits in `argon.md` and `SYNTHESIS.md` without putting the phrases back.
6. Make `check_theme_assets.py` enforce the 30KB and 2KB caps and reject backdrop geometry that intersects a station interior.

Until those six are done, the honest ceiling is the matrix above.
