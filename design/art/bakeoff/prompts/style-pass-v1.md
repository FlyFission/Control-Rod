# Style pass v1: Blender v2 render to premium engineering cutaway

These prompts restyle `design/art/bakeoff/blender-v2-healthy.jpg` and `blender-v2-scram.jpg` in place, keeping their exact geometry. Each prompt stands alone.

**Process.** Claude wrote draft v0 from `final-v2.md`'s STYLE block and plant content. Codex (gpt-6.2-astra) and Antigravity (gemini-4-neon-high) each critiqued it once, read-only, in 6 bullets. Claude merged the result into v1 with the decisions below.

**Use.** Attach the render with its framing locked, padded from 2400×1500 to 2400×1600 with 50 rows of its own background colour above and 50 below. Generate at 3:2, scale to 2400×1600, then crop the 50 rows back off. The SCRAM render is upscaled from 1440×900 to 2400×1500 first. gpt-image uses `transparent_background=false`; Gemini uses `AspectRatio 3:2`.

## HEALTHY prompt

```text
Pixel-locked style pass over the attached render of a nuclear plant, for exact-registration interface overlays. Treat the render as a locked drawing: reproduce it edge to edge at its native framing, scale and isometric view, and change only colour, value, texture, line crispness and lighting inside the existing shapes. Do not zoom, crop, shift, resize, add or remove any object, pipe, room, furniture, worker, callout, tick or frame mark. If a style instruction would move an edge, skip it.

Goal: a premium annotated engineering cutaway, calm and legible, not dark, sparse or flat. Lift the broad containment deck and the front cut wedge one to two navy values above the background and give them fine steel grating and faint floor joints. Give the cylindrical primary shield, steam generators, pumps, pressuriser and hatch smooth multi-step shading with subtle panel and flange seams so they read as solid 3D forms. Put 45° hatching on cut concrete faces and a thin steel liner line on the containment's inner face. Draw the far containment wall as reinforced concrete rendered lightly translucent as a drafting convention, with crisp pale-cyan cut edges and no glass reflections. Separate the polar-crane girder cleanly in depth from the vessels behind it. Clarify both outer ring tracks and every perimeter room. Inside rooms, distinguish cabinets, tanks and drums from the floors behind them with restrained contact shadows at existing bases. Keep empty floor empty.

Keep the plant equipment exactly as rendered; do not add or complete loops, pipes or pumps. The fuel in the core cutout is the one dramatic focal point: cold Cherenkov blue #6bd8f0, the brightest thing in the image, with a soft glow confined to the core cutout and the shield faces immediately around it, internal bands kept, never clipped to white.

Keep every existing worker exactly in place, with the same pose, head outline, chair overlap and silhouette, and add no new people. Render them in white anti-contamination coveralls, bright against the navy. Room screens and rack indicators stay matte #3b95b7 or darker with no bloom; re-tint any yellow indicator to #3b95b7.

Keep only the existing circular callout bubbles, dimension arrows, centre lines and border ruler ticks as crisp hairlines, with no readable letters or numbers, and add no new callouts.

STYLE. Engineering-cutaway general-arrangement sheet. Matte architectural fills from #091930 to #18375c, with gentle multi-step shading on curved forms; deepest shadow #031024, never pure black. Edges are #255375 hairlines; cut profiles are crisp pale-cyan hairlines, near-white only on short segments, never a continuous bright rim. Centre lines are fine dash-dot. Fine 45° hatching only on cut material. No readable letters, numbers or logos. Strictly cool navy-and-cyan palette: zero yellow, orange, red, pink or magenta. Mid-tones stay calm and low-contrast for the interface overlays drawn on top.
```

## SCRAM prompt

```text
Pixel-locked style pass over the attached render of a nuclear plant in its tripped (SCRAM) state, for exact-registration interface overlays. Treat the render as a locked drawing: reproduce it edge to edge at its native framing, scale and isometric view, and change only colour, value, texture, line crispness and lighting inside the existing shapes. Do not zoom, crop, shift, resize, add or remove any object, pipe, room, furniture, worker, callout, tick or frame mark. If a style instruction would move an edge, skip it.

Goal: a premium annotated engineering cutaway, calm and legible, with no black voids. Lift the broad containment deck and the front cut wedge above the background and give them fine steel grating and faint floor joints. Give the primary shield, steam generators, pumps, pressuriser and hatch smooth multi-step shading with subtle seams so they read as solid 3D forms. Put 45° hatching on cut concrete and a thin liner line inside the containment wall. Draw the far wall as concrete rendered lightly translucent as a drafting convention, with no glass reflections. Keep the plant equipment exactly as rendered, and do not draw or move control rods or drive heads.

Inside the containment only: the core cutout is dark with zero cyan, a schematic cue for the tripped state. Re-grade the existing emergency lamps from clipped pink-white to controlled deep emergency crimson #d9383a, and the existing red cut rim and red equipment outlines to #b83238, never hot pink or magenta. Let those lamps cast soft, low-key crimson fill from #3a1119 to #6e1d26 across the shield faces, steam generators and deck grating, so every silhouette stays legible.

Outside the containment wall, everything is identical in geometry and in the cool navy-and-cyan palette: every room, worker, ring track and callout, with zero red, warm or pink tint. Room screens dim slightly to #265c78 and stay readable; this is not a station blackout. Keep every existing worker exactly in place, with the same pose and silhouette, in white anti-contamination coveralls, and add no new people. Keep only the existing callout bubbles, dimension arrows, centre lines and border ticks as crisp hairlines, with no readable letters or numbers.

STYLE. Engineering-cutaway general-arrangement sheet. Matte architectural fills from #091930 to #18375c, with gentle multi-step shading on curved forms; deepest shadow #031024, never pure black. Edges are #255375 hairlines; cut profiles are crisp pale-cyan hairlines, near-white only on short segments. Centre lines are fine dash-dot. Fine 45° hatching only on cut material. No readable letters, numbers or logos. Red is allowed only inside the containment as described; everything else is cool navy and cyan. Mid-tones stay calm and low-contrast for the interface overlays drawn on top.
```

## Decisions from the critiques

- **Geometry lock (both critics):** "premium annotated / 30° isometric" became "locked drawing, change colour and value inside existing shapes only; skip any instruction that would move an edge".
- **"No people" removed from the STYLE block (both):** it contradicted keeping ~30 workers. It is now "keep every existing worker; add no new people".
- **Equipment inventory (both):** "four-loop… four steam generators" was removed. The render shows two steam-generator cubicles, so the prompt now says "keep the equipment exactly as rendered; do not add or complete loops".
- **Containment translucency:** the coordinator asked for it, and both critics warned against glass. It is now concrete rendered lightly translucent as a drafting convention, with no glass reflections and no dome.
- **Dark, sparse, flat zones (both):** lifted deck values, grating and joints as surface texture only, multi-step shading on cylinders, crane girder separation, ring tracks, room props and contact shadows. "Keep empty floor empty" stays.
- **Cherenkov glow:** Codex wanted no spill and the coordinator wanted a dramatic focal point. The glow is the brightest element, confined to the core cutout and the shield faces immediately around it.
- **SCRAM is standalone (both).** The dark core is framed as a schematic state cue, because Antigravity noted that real fuel keeps glowing after a trip. Red is confined to the containment, and controlled crimson fill (Antigravity's hexes) replaces the clipped pink lamps. No rods are drawn (Codex). Screens dim but stay readable, since this is not a station blackout.
- **Kept against a critic:** both prompts keep the white anti-C coveralls. Antigravity noted that a plant veteran would not expect anti-C coveralls on desk workers outside containment, but white coveralls are the owner's explicit radworker choice for legibility. Codex's "no hoods" is honoured by keeping each head outline rather than drawing hoods.
- **Rejected:** Codex's suggestion to composite the original Blender linework over the repaint. It is a valid recovery fallback, but this run measures the raw style pass.
