# Style pass v2: Blender v3 layer frames and workers

These are the production prompts for the hybrid route. They restyle the Blender v3 layer frames in `design/art/bakeoff/v3/` (frame-dark, frame-lit and frame-tripped, all from one camera) and the worker sprite sheet. Registration must stay exact, because the app cuts per-room layers from the styled frames with Blender masks.

**Process.** Claude wrote a draft from `style-pass-v1.md` plus the v3 brief: an enriched core, a structured site, a SCRAM carried by lamps and the cut line, and no people. Codex (gpt-6.2-astra) and Antigravity (gemini-4-neon-high) each critiqued it once, read-only, in 6 bullets. Claude merged the result into v2 with the decisions at the end.

**Run order.**
1. Style frame-dark first.
2. Make frame-lit and frame-tripped as edits of the styled frame-dark (attachment 1), with the Blender lit or tripped frame as attachment 2, used only to locate what switches on.

**Framing.** Pad every frame from 2400×1500 to 2400×1600 with 50 rows of its own background colour above and 50 below. Generate at 3:2, scale to 2400×1600, then crop the padding back off. gpt-image uses `transparent_background=false`.

**Workers.** The Blender sheet is opaque on flat #000e23. It is keyed to a real alpha (89% of pixels are exactly that colour) and run with `transparent_background=true`. Afterwards it is scaled back to the 2560×1144 canvas and the keyed input alpha is applied as the silhouette.

## DARK frame (frame-dark.jpg → styled DARK)

```text
Pixel-locked style pass over the attached render of a nuclear plant (one production layer frame), for exact-registration interface overlays and per-room masks. Treat the render as a locked drawing: keep its 2400×1500 framing, scale and isometric view, paint inside the existing faces, and keep every Blender edge at its source coordinates, including room corners, desk fronts, chair seats, the crane girder, the vessel cut and the assembly pattern. Do not zoom, crop, shift, resize, straighten ellipses, add or remove any object, pipe, road marking, room, furniture piece or centre line. If a style instruction would move an edge, skip it.

Goal: a crisp, legible architectural-engineering cutaway with clear tonal separation between ground, concrete and machinery, never dark, sparse or flat.

Site: preserve the existing survey grid, radial lines, ring-road lanes, directional arrows and zebra crossings without adding or moving any marking. Lift the paved apron between the ring road and the rooms to #0e223d–#173459, one clear tonal step above the outer ground, with subtle matte concrete-slab grain, so it reads as calm structured ground, never a black void.

Containment: lift the operating deck and the raised steam-generator and pump platforms above the site with fine steel grating and floor joints. Give the primary shield (keeping its front cut and circular pipe penetrations crisp), the steam generators, the reactor coolant pumps and the small pressuriser three-step shading with bolted flange seams. Put 45° hatching on cut concrete and a thin steel liner line along the inner face of the containment wall. Keep the far containment wall solid, opaque ribbed concrete with its existing hatch and tank. Separate the polar-crane bridge girder clearly in depth.

Core: a schematic cutaway of the reactor vessel barrel showing a crisp upright square grid of fuel assemblies inside the core baffle. Keep its outline exactly. Light it as a schematic power-state overlay in Cherenkov blue #6bd8f0 with #b8f2ff top-grid highlights, strongest at the top and falling off with depth, never clipped flat white, with no pool caustics. A restrained cyan spill reaches only the shield cut faces immediately around it. It is the brightest thing in the image.

Rooms are dark but solid and clearly modelled: matte shaded walls, floors and furniture (#122742–#24466b) with crisp #3a6b94 edge hairlines, grounded contact shadows, screens off (#0a1728), no glow. There are no people in this frame; add none. Keep only the existing dash-dot centre lines and site lines as crisp hairlines; add no callout bubbles, leaders, dimension arrows, border ticks, text or numbers.

STYLE. Engineering-cutaway general-arrangement sheet. Matte architectural fills in distinct tiers: site apron #0e223d–#173459; deck and structural concrete #1a3a60–#2d5885; curved vessels and machinery #244b75–#4174a3 with three-step shading and bevel highlights up to #609ac7; deepest recess #061326, never pure black. Structure edges are #3e749e hairlines; cut profiles are crisp pale cyan (#7ccae6) following the existing cut rims, without neon bloom. Reserve the deepest navy for the background and recesses. No people. No readable letters, numbers or logos. Strictly cool navy and cyan: zero yellow, orange, red, pink or magenta. The outer site stays calm enough for interface overlays.
```

## LIT frame (edit of styled DARK; attachments: [styled DARK, frame-lit.jpg])

```text
Same rendering, only the rooms' lights are on. Edit attachment 1 (the styled dark frame) in place so that every pixel outside the room cutaways stays identical to it: site paving, ring road, containment, core, crane and exterior wall faces. Use attachment 2 (frame-lit.jpg) only to locate which screens, panels and task lights switch on. Change only inside the room cutaways, with zero light spill beyond the room walls. Start each room from its styled dark pixels: light the existing screens and panels in luminous cyan (#68c8e8 with a #bdf2ff top highlight and a tight reflected lift on the desk below), lift lit floors and walls to #1e4268–#2e5d8a under soft cool-cyan overhead light, and shade lit furniture in #28527a–#4a82ad. Rooms without screens (tank and drum storage, labs) get overhead light only. Do not invent fixtures or add a monitor to every bay. Keep chair edges, furniture shadows and wall caps exactly registered. No people; add none. Strictly cool navy and cyan, no warm colours, no text.
```

## TRIPPED frame (edit of styled DARK; attachments: [styled DARK, frame-tripped.jpg])

```text
Same rendering, only the reactor has tripped. Edit attachment 1 (the styled dark frame) in place so that every pixel outside the containment's outer wall face stays identical to it, with zero crimson glow or spill past the outer containment rim. Use attachment 2 (frame-tripped.jpg) only to locate the wall lamps, deck beacons and the red cut rim. Inside the containment only: remove the core's cyan power-state overlay and leave the fuel assemblies and vessel in readable dark steel-blue shading (#0c1d33–#183252), a schematic tripped-state cue that implies neither cooling nor decay heat has stopped. Light each existing wall lamp and deck beacon as a diagram annunciator in crimson #e03c42 with a tight local halo, and tint the containment cut-rim hairlines #c93840. These lamps and that line carry the alarm. The deck and equipment stay legible in cool dark navy (#122742–#274b73) with only a faint crimson rim-bounce (#4d1a29) on faces turned toward the lamps. Do not draw or move control rods or drive heads. No people; add none. No text.
```

## WORKERS sheet (workers-sheet.png, keyed to alpha)

```text
Pixel-locked sprite-sheet repaint: preserve every figure's exact silhouette, pose, size and pixel position; the background is fully transparent. Draw nothing between or around the figures: no floor, shadow, frame or checkerboard. Repaint the ten main figures in the same crisp engineering-cutaway illustration style, with #255375 hairline outlines and #6eb8dc pale-cyan rim highlights. At 64 px tall, separate head, hands and torso with broad value shapes rather than an outer halo. Top row: matte white anti-contamination coveralls (#cddbe8–#eef5fa) with the existing fitted hood up, cyan-blue taped gloves and arm and leg bands (#58b4d8), white shoe covers, and a small clip-on dosimeter badge on the chest. Bottom row: station coveralls in a medium steel blue (#3b658c–#5c8db8) that stays clearly lighter than a dark navy background, a cyan armband, pale bare hands and a small chest dosimeter badge. Faces are simple, calm and human, inside the existing head shapes. No warm colours anywhere except the small amber lamp (#ffe27a) held up by the standing needs-you figure in each row; that figure's forearm band is neutral cyan. Repaint the five tiny figures along the bottom edge in their exact positions and sizes with simplified flat shading in the matching palette, with no added detail. No text, no logos.
```

## Decisions from the critiques

- **Lit and tripped edit the styled dark frame (both critics).** The styled dark frame is attachment 1, the base being edited. The Blender lit or tripped frame is attachment 2 and only locates what changes, with no spill outside the rooms or the containment. Codex's production check is applied: the lit frame must be pixel-identical to the dark frame outside the rooms, measured below.
- **Internal edges locked (Codex).** Chair seats, desk fronts, room corners, girder, vessel cut and assembly grid stay at their source coordinates.
- **No invented annotations (Antigravity).** v3 frames carry no callout bubbles, dimension arrows or border ticks, so the prompts keep only the existing centre lines and site markings and add none. The site markings already exist, so none are added.
- **Far wall opaque (Antigravity).** v3's far wall is solid ribbed concrete with a hatch and tank, so v1's translucent-wall convention is dropped.
- **Values (both).** v1's near-black fill cap reproduced the dark frame. Antigravity's tiered fills replace it (apron, deck, machinery, with the deepest navy only in recesses), and rooms are dark but solid rather than wireframe-hollow.
- **Core (both).** It keeps its outline and assembly grid, adds depth falloff and top highlights, and is framed as a schematic power-state overlay. **Deviation from the brief:** "water caustics" is dropped. Both critics flagged that caustics imply an open pool, which a plant veteran would reject for a sealed PWR vessel.
- **Trip (both).** The lamps and cut line carry the alarm, as annunciators. The deck stays navy with only a faint crimson bounce, the fuel stays readable in steel-blue, and the prompt says the dark core implies neither cooling nor decay heat has stopped. No rods are drawn.
- **Lit specifics (both).** Only existing screens, panels and task lights switch on. Screenless bays get overhead light only, and no monitors are invented.
- **Workers (both).** The sheet is opaque, so it is keyed to alpha and the input silhouette is applied after the repaint. Antigravity's per-row palette matches the actual cyan taped gloves and bands. The needs-you forearm band is neutral, so only the lamp is warm. Codex's "no exterior halo" becomes broad value shapes plus a fine rim. The tiny scale figures are kept, simplified.

## Amendment, 2026-11-24: polar crane

The owner found the crane bridge distracting and "much too low to the reactor". In the DARK prompt, the sentence "Separate the polar-crane bridge girder clearly in depth." is replaced with:

> The polar crane rides high on the rear wall: keep its ring girder, bridge, trolley and hook block as a faint phantom outline (thin, low-contrast dashed hairlines, drafting convention for equipment shown for reference), never a solid or bright beam, so it reads as a crane high above the reactor and does not compete with the core.

The TRIPPED prompt gains, after "Do not draw or move control rods or drive heads.":

> Keep the polar crane high on the rear wall exactly as in attachment 1: a faint phantom outline, never a solid beam.

The geometry change, the measurements and the exact tool arguments are in `design/art/source/hybrid/PROMPTS.md`, under "Polar-crane fix".
