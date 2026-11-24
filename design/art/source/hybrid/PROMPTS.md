# Hybrid production frames: provenance

- Generated: 2026-11-24 (UTC). This file is written by `make_hybrid_prompts_md.py`; nothing in it is typed by hand.
- Inputs: Blender v3 layer frames and the worker sheet from `design/art/bakeoff/v3/` at commit `c75a0633`.
- Prompts: `design/art/bakeoff/prompts/style-pass-v2.md`. Generator: Codex CLI 0.171.0 (`codex exec`), model `gpt-6.2-astra` via ChatGPT sign-in, built-in tool `image_gen.imagegen`. Gemini was tried once on frame-dark and returned HTTP 503 (no capacity for gemini-3.1-flash-image).

## Pipeline

1. **frame-dark**: the Blender frame, padded to 2400×1600 with its own background colour (50 rows above and below), styled at 3:2, scaled to 2400×1600, then cropped back to 2400×1500.
2. **frame-lit / frame-tripped**: edits of the styled frame-dark, padded the same way and passed as reference 1, with the padded Blender lit or tripped frame as reference 2. Both were recovered the same way.
3. **Lock**: `lock_composite.py` makes frame-lit pixel-identical to frame-dark outside the union of anchors.json room bboxes (+12 px, 6 px inward feather), and frame-tripped identical outside the containment ellipse (core bbox +40 px, 10 px feather). The generator had re-rolled fine texture across the whole frame; the check output below shows the before and after.
4. **Workers**: the Blender sheet is opaque on #000e23 (89% of pixels exact). It was keyed to alpha (|ΔRGB| ≤ 3 transparent, ramping to opaque by 30), styled with `transparent_background=true`, scaled back to 2560×1144, and given the keyed input alpha as its exact silhouette.
5. Encoded with `cwebp -q 90 -exact` (frames) and `cwebp -q 90 -alpha_q 100 -exact` (workers). Lossy encoding adds about 0.8/255 mean noise between frames outside the masks (shown below); a lossless encode would make the identity exact.

## Files

| File | Size | Bytes | sha256 |
|---|---|---|---|
| `frame-dark.webp` | 2400×1500 | 689912 | `c61c9d958b66b0c6d29ed94cf2d023bae3b6cf4aa96ca256556abc2e18525a1c` |
| `frame-lit.webp` | 2400×1500 | 676640 | `519aca9abe2acd2682d89a0c794d13a27de9f0ceec7ef8bcfbe018c441eff74f` |
| `frame-tripped.webp` | 2400×1500 | 623962 | `2739c29bd6ca8a036e4f4fb543d5c6b8fb3c5bcd30f72fb0a476d8b918ffdfec` |
| `workers-sheet.webp` | 2560×1144 | 226116 | `ff6dd76dfeca24aef94b7fd6dfb76603c1496146d36aab84c83eb8f2d92e236c` |

## Input digests

| Input | sha256 |
|---|---|
| `frame-dark.jpg` | `f495bb28f27b72b9777ab059db0b95cccc2dcfae3d8f0ca02a44bc47aaa9279e` |
| `frame-lit.jpg` | `66a2cacd88483894f4ea3d703fc984240e7f5ab3ee116fc67903d9bdc9591a29` |
| `frame-tripped.jpg` | `19c71702070fc902dc97ccbcf84f9d3e28580549fd4a9992a2bca5cb8bd1d3a8` |
| `workers-sheet.png` | `d8f8aa135295fdbcde12df92881cc99071a30534667bcac4ee2b945bdee9c16e` |
| `anchors.json` | `6522fac0292017ae93a50f7f36a08451dc03cf1b70ed34d6058a3e89e993d765` |

## Registration (register.py: edge NCC per anchors.json room bbox; best shift within ±40 px at 4 px resolution)

### styled frame-dark vs Blender frame-dark

```text
process ncc@0= 0.84 best= 0.84 at shift dx= +0 dy= +0 px
mechanical ncc@0= 0.84 best= 0.84 at shift dx= +0 dy= +0 px
electrical ncc@0= 0.83 best= 0.83 at shift dx= +0 dy= +0 px
civil ncc@0= 0.84 best= 0.84 at shift dx= +0 dy= +0 px
assurance ncc@0= 0.86 best= 0.86 at shift dx= +0 dy= +0 px
project-controls ncc@0= 0.87 best= 0.87 at shift dx= +0 dy= +0 px
review ncc@0= 0.73 best= 0.73 at shift dx= +0 dy= +0 px
interface ncc@0= 0.79 best= 0.79 at shift dx= +0 dy= +0 px
verification ncc@0= 0.77 best= 0.77 at shift dx= +0 dy= +0 px
your-office ncc@0= 0.75 best= 0.75 at shift dx= +0 dy= +0 px
document-control ncc@0= 0.91 best= 0.91 at shift dx= +0 dy= +0 px
bench ncc@0= 0.82 best= 0.82 at shift dx= +0 dy= +0 px
quarantine ncc@0= 0.87 best= 0.87 at shift dx= +0 dy= +0 px
core ncc@0= 0.58 best= 0.58 at shift dx= +0 dy= +0 px
null baseline (box vs unrelated area): mean ncc=-0.00, max=0.23
```

### final frame-lit vs styled frame-dark (must be 0 px everywhere)

```text
process ncc@0= 0.97 best= 0.97 at shift dx= +0 dy= +0 px
mechanical ncc@0= 0.80 best= 0.80 at shift dx= +0 dy= +0 px
electrical ncc@0= 0.80 best= 0.80 at shift dx= +0 dy= +0 px
civil ncc@0= 0.80 best= 0.80 at shift dx= +0 dy= +0 px
assurance ncc@0= 0.81 best= 0.81 at shift dx= +0 dy= +0 px
project-controls ncc@0= 0.96 best= 0.96 at shift dx= +0 dy= +0 px
review ncc@0= 0.74 best= 0.74 at shift dx= +0 dy= +0 px
interface ncc@0= 0.96 best= 0.96 at shift dx= +0 dy= +0 px
verification ncc@0= 0.79 best= 0.79 at shift dx= +0 dy= +0 px
your-office ncc@0= 0.75 best= 0.75 at shift dx= +0 dy= +0 px
document-control ncc@0= 0.96 best= 0.96 at shift dx= +0 dy= +0 px
bench ncc@0= 0.83 best= 0.83 at shift dx= +0 dy= +0 px
quarantine ncc@0= 0.97 best= 0.97 at shift dx= +0 dy= +0 px
core ncc@0= 1.00 best= 1.00 at shift dx= +0 dy= +0 px
null baseline (box vs unrelated area): mean ncc=0.00, max=0.23
```

### final frame-lit vs Blender frame-lit

```text
process ncc@0= 0.81 best= 0.81 at shift dx= +0 dy= +0 px
mechanical ncc@0= 0.66 best= 0.66 at shift dx= +0 dy= +0 px
electrical ncc@0= 0.65 best= 0.65 at shift dx= +0 dy= +0 px
civil ncc@0= 0.66 best= 0.66 at shift dx= +0 dy= +0 px
assurance ncc@0= 0.69 best= 0.69 at shift dx= +0 dy= +0 px
project-controls ncc@0= 0.83 best= 0.83 at shift dx= +0 dy= +0 px
review ncc@0= 0.77 best= 0.77 at shift dx= +0 dy= +0 px
interface ncc@0= 0.75 best= 0.75 at shift dx= +0 dy= +0 px
verification ncc@0= 0.60 best= 0.60 at shift dx= +0 dy= +0 px
your-office ncc@0= 0.58 best= 0.58 at shift dx= +0 dy= +0 px
document-control ncc@0= 0.87 best= 0.87 at shift dx= +0 dy= +0 px
bench ncc@0= 0.82 best= 0.82 at shift dx= +0 dy= +0 px
quarantine ncc@0= 0.84 best= 0.84 at shift dx= +0 dy= +0 px
core ncc@0= 0.58 best= 0.58 at shift dx= +0 dy= +0 px
null baseline (box vs unrelated area): mean ncc=-0.01, max=0.23
```

### final frame-tripped vs Blender frame-tripped

```text
process ncc@0= 0.84 best= 0.84 at shift dx= +0 dy= +0 px
mechanical ncc@0= 0.84 best= 0.84 at shift dx= +0 dy= +0 px
electrical ncc@0= 0.83 best= 0.83 at shift dx= +0 dy= +0 px
civil ncc@0= 0.84 best= 0.84 at shift dx= +0 dy= +0 px
assurance ncc@0= 0.86 best= 0.86 at shift dx= +0 dy= +0 px
project-controls ncc@0= 0.87 best= 0.87 at shift dx= +0 dy= +0 px
review ncc@0= 0.73 best= 0.73 at shift dx= +0 dy= +0 px
interface ncc@0= 0.79 best= 0.79 at shift dx= +0 dy= +0 px
verification ncc@0= 0.77 best= 0.77 at shift dx= +0 dy= +0 px
your-office ncc@0= 0.73 best= 0.73 at shift dx= +0 dy= +0 px
document-control ncc@0= 0.91 best= 0.91 at shift dx= +0 dy= +0 px
bench ncc@0= 0.82 best= 0.82 at shift dx= +0 dy= +0 px
quarantine ncc@0= 0.87 best= 0.87 at shift dx= +0 dy= +0 px
core ncc@0= 0.58 best= 0.58 at shift dx= +0 dy= +0 px
null baseline (box vs unrelated area): mean ncc=-0.01, max=0.23
```

## Pixel identity outside the change regions (check_outside.py)

```text
styled-lit (raw) vs styled-dark:
outside rooms: mean |dRGB| 6.81/255, changed>8: 22.17%, max 215
inside rooms: mean |dRGB| 12.25/255, changed>8: 37.29%, max 217
styled-tripped (raw) vs styled-dark:
outside core: mean |dRGB| 6.30/255, changed>8: 17.56%, max 227
inside core: mean |dRGB| 33.47/255, changed>8: 88.37%, max 230
final lit vs styled-dark (after lock_composite rooms, margin 12, feather 6):
outside rooms: mean |dRGB| 0.00/255, changed>8: 0.00%, max 0
inside rooms: mean |dRGB| 11.82/255, changed>8: 36.23%, max 217
final tripped vs styled-dark (after lock_composite core, margin 40, feather 10):
outside core: mean |dRGB| 0.00/255, changed>8: 0.00%, max 0
inside core: mean |dRGB| 32.83/255, changed>8: 86.83%, max 226
Blender inputs for reference, lit vs dark / tripped vs dark:
outside rooms: mean |dRGB| 0.00/255, changed>8: 0.00%, max 3
inside rooms: mean |dRGB| 1.92/255, changed>8: 4.16%, max 101
outside core: mean |dRGB| 0.00/255, changed>8: 0.00%, max 8
inside core: mean |dRGB| 26.85/255, changed>8: 92.30%, max 220
```

## Warm-colour check (warmcheck.py)

```text
styled-dark.png warm[all]=0.00% warm[your-office]=0.00% warm[core]=0.00% warm[elsewhere]=0.00%
final-lit.png warm[all]=0.00% warm[your-office]=0.00% warm[core]=0.00% warm[elsewhere]=0.00%
final-tripped.png warm[all]=1.59% warm[your-office]=0.00% warm[core]=4.94% warm[elsewhere]=0.03%
```

## Worker sheet checks

```text
canvas 2560x1144; generated (1877, 838) scaled to canvas
alpha IoU generated vs keyed input silhouette at 0 px shift: 0.920 (best over +-12 px: at 0,0)
final alpha equals keyed input alpha: True
warm px per 512-px column (col 4 = needs-you lamp): [0, 1, 0, 1855, 7]
```

## Tool arguments (as Codex recorded them)

### dark-out.png

- Tool `image_gen.imagegen`; references `frame-dark-in.png`; transparent_background `false`; native 1536×1024

```text
Pixel-locked style pass over the attached render of a nuclear plant (one production layer frame), for exact-registration interface overlays and per-room masks. Treat the render as a locked drawing: keep its 2400×1500 framing, scale and isometric view, paint inside the existing faces, and keep every Blender edge at its source coordinates, including room corners, desk fronts, chair seats, the crane girder, the vessel cut and the assembly pattern. Do not zoom, crop, shift, resize, straighten ellipses, add or remove any object, pipe, road marking, room, furniture piece or centre line. If a style instruction would move an edge, skip it.

Goal: a crisp, legible architectural-engineering cutaway with clear tonal separation between ground, concrete and machinery, never dark, sparse or flat.

Site: preserve the existing survey grid, radial lines, ring-road lanes, directional arrows and zebra crossings without adding or moving any marking. Lift the paved apron between the ring road and the rooms to #0e223d–#173459, one clear tonal step above the outer ground, with subtle matte concrete-slab grain, so it reads as calm structured ground, never a black void.

Containment: lift the operating deck and the raised steam-generator and pump platforms above the site with fine steel grating and floor joints. Give the primary shield (keeping its front cut and circular pipe penetrations crisp), the steam generators, the reactor coolant pumps and the small pressuriser three-step shading with bolted flange seams. Put 45° hatching on cut concrete and a thin steel liner line along the inner face of the containment wall. Keep the far containment wall solid, opaque ribbed concrete with its existing hatch and tank. Separate the polar-crane bridge girder clearly in depth.

Core: a schematic cutaway of the reactor vessel barrel showing a crisp upright square grid of fuel assemblies inside the core baffle. Keep its outline exactly. Light it as a schematic power-state overlay in Cherenkov blue #6bd8f0 with #b8f2ff top-grid highlights, strongest at the top and falling off with depth, never clipped flat white, with no pool caustics. A restrained cyan spill reaches only the shield cut faces immediately around it. It is the brightest thing in the image.

Rooms are dark but solid and clearly modelled: matte shaded walls, floors and furniture (#122742–#24466b) with crisp #3a6b94 edge hairlines, grounded contact shadows, screens off (#0a1728), no glow. There are no people in this frame; add none. Keep only the existing dash-dot centre lines and site lines as crisp hairlines; add no callout bubbles, leaders, dimension arrows, border ticks, text or numbers.

STYLE. Engineering-cutaway general-arrangement sheet. Matte architectural fills in distinct tiers: site apron #0e223d–#173459; deck and structural concrete #1a3a60–#2d5885; curved vessels and machinery #244b75–#4174a3 with three-step shading and bevel highlights up to #609ac7; deepest recess #061326, never pure black. Structure edges are #3e749e hairlines; cut profiles are crisp pale cyan (#7ccae6) following the existing cut rims, without neon bloom. Reserve the deepest navy for the background and recesses. No people. No readable letters, numbers or logos. Strictly cool navy and cyan: zero yellow, orange, red, pink or magenta. The outer site stays calm enough for interface overlays.
```

### lit-out.png

- Tool `image_gen.imagegen`; references `styled-dark-in.png`, `frame-lit-in.png`; transparent_background `false`; native 1536×1024

```text
Same rendering, only the rooms' lights are on. Edit attachment 1 (the styled dark frame) in place so that every pixel outside the room cutaways stays identical to it: site paving, ring road, containment, core, crane and exterior wall faces. Use attachment 2 (frame-lit.jpg) only to locate which screens, panels and task lights switch on. Change only inside the room cutaways, with zero light spill beyond the room walls. Start each room from its styled dark pixels: light the existing screens and panels in luminous cyan (#68c8e8 with a #bdf2ff top highlight and a tight reflected lift on the desk below), lift lit floors and walls to #1e4268–#2e5d8a under soft cool-cyan overhead light, and shade lit furniture in #28527a–#4a82ad. Rooms without screens (tank and drum storage, labs) get overhead light only. Do not invent fixtures or add a monitor to every bay. Keep chair edges, furniture shadows and wall caps exactly registered. No people; add none. Strictly cool navy and cyan, no warm colours, no text.
```

### tripped-out.png

- Tool `image_gen.imagegen`; references `styled-dark-in.png`, `frame-tripped-in.png`; transparent_background `false`; native 1536×1024

```text
Same rendering, only the reactor has tripped. Edit attachment 1 (the styled dark frame) in place so that every pixel outside the containment's outer wall face stays identical to it, with zero crimson glow or spill past the outer containment rim. Use attachment 2 (frame-tripped.jpg) only to locate the wall lamps, deck beacons and the red cut rim. Inside the containment only: remove the core's cyan power-state overlay and leave the fuel assemblies and vessel in readable dark steel-blue shading (#0c1d33–#183252), a schematic tripped-state cue that implies neither cooling nor decay heat has stopped. Light each existing wall lamp and deck beacon as a diagram annunciator in crimson #e03c42 with a tight local halo, and tint the containment cut-rim hairlines #c93840. These lamps and that line carry the alarm. The deck and equipment stay legible in cool dark navy (#122742–#274b73) with only a faint crimson rim-bounce (#4d1a29) on faces turned toward the lamps. Do not draw or move control rods or drive heads. No people; add none. No text.
```

### workers-out.png

- Tool `image_gen.imagegen`; references `workers-in.png`; transparent_background `true`; native 1877×838

```text
Pixel-locked sprite-sheet repaint: preserve every figure's exact silhouette, pose, size and pixel position; the background is fully transparent. Draw nothing between or around the figures: no floor, shadow, frame or checkerboard. Repaint the ten main figures in the same crisp engineering-cutaway illustration style, with #255375 hairline outlines and #6eb8dc pale-cyan rim highlights. At 64 px tall, separate head, hands and torso with broad value shapes rather than an outer halo. Top row: matte white anti-contamination coveralls (#cddbe8–#eef5fa) with the existing fitted hood up, cyan-blue taped gloves and arm and leg bands (#58b4d8), white shoe covers, and a small clip-on dosimeter badge on the chest. Bottom row: station coveralls in a medium steel blue (#3b658c–#5c8db8) that stays clearly lighter than a dark navy background, a cyan armband, pale bare hands and a small chest dosimeter badge. Faces are simple, calm and human, inside the existing head shapes. No warm colours anywhere except the small amber lamp (#ffe27a) held up by the standing needs-you figure in each row; that figure's forearm band is neutral cyan. Repaint the five tiny figures along the bottom edge in their exact positions and sizes with simplified flat shading in the matching palette, with no added detail. No text, no logos.
```
