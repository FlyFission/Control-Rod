## Shared style block

```text
STYLE. Engineering-cutaway general-arrangement sheet. Flat matte fills: #091930 surfaces with one lighter and one darker step, #000e23 deepest shadow. Edges are #255375 hairlines; cut profiles are crisp pale-cyan hairlines, near-white only on short segments, never a continuous bright rim, no bloom. Centre lines are fine dash-dot. Fine 45° hatching only on cut material, never on floors or pad tops. Labels are tiny abstract dash-blocks. No people, no readable letters, numbers or logos, no warm colours or magenta. Mid-tones stay calm and low-contrast for the interface overlays drawn on top.
```

- The block is asset-neutral and already pasted word for word into each prompt below.
- Screen rules live only in the two tile prompts; ground colour and core glow live only in SITE.

## SITE prompt

```text
Ink the attached site blockout in place as an opaque nuclear-plant general-arrangement plate. It fixes geometry, not colour or brightness: reproduce it edge to edge at the same scale and 30° isometric view, with no zoom, crop or shift. Trace both road edges, every spur bend and all 13 pads exactly where they lie, including those inside the ring and the bottom-centre slab whose near tip only overlaps the road; do not tidy the layout.

Ground is flat #000e23. Pad tops stay bare matte #091930 with a fine slab edge; add equipment only inside the containment. Ignore the blockout's white-versus-grey line brightness: the whole ring is a matte service road with a low utility rack and every spur a plain covered cable run, in uniform dim #255375 with no glow.

Inside the containment, section a four-loop pressurised-water reactor. The central drum is the concrete primary shield: keep its footprint and rear rim, and open a local hatched cut in its near side. The steel vessel sits low inside, its bolted domed head near floor level with control rod drive housings above, the cut showing the core barrel and upright fuel assemblies. Only the fuel glows: restrained #6bd8f0 inside the vessel outline, no spill.

Four steam generators stand in paired concrete cubicles flanking the drum, two left and two right. The rear pair rise to below the wall rim; the front pair are cut just above the floor, a thin hatched shell with fine U-tube lines. Beside each stands one coolant pump motor; beside one rear generator, one slimmer pressuriser. Loop piping runs below the floor: show only short sectioned pipe stubs at the base of the shield cut.

On the rear wall at floor level: a round equipment hatch and a small personnel airlock, a thin liner line on the inner face, hatched concrete at the cut ends. The polar crane's ring girder follows the upper inner face of the rear half-wall only, ending at the cut ends; one slender bridge spans between them in faint phantom outline, trolley parked aside.

STYLE. Engineering-cutaway general-arrangement sheet. Flat matte fills: #091930 surfaces with one lighter and one darker step, #000e23 deepest shadow. Edges are #255375 hairlines; cut profiles are crisp pale-cyan hairlines, near-white only on short segments, never a continuous bright rim, no bloom. Centre lines are fine dash-dot. Fine 45° hatching only on cut material, never on floors or pad tops. Labels are tiny abstract dash-blocks. No people, no readable letters, numbers or logos, no warm colours or magenta. Mid-tones stay calm and low-contrast for the interface overlays drawn on top.

Sheet marks: dash-dot centre lines through the containment on both axes and a few unnumbered dimension ticks and leaders around it, off the pads. No title block or border.
```

Length: about 340 words of scene text plus the 85-word style block (estimated, not machine-counted).

- **AspectRatio:** `3:2`
- **Attachment and preprocessing** (work on a copy of `refs/site-2400x1500.png`; attach only the result in `ImagePaths`, not the key frame):
  1. Erase labels: inside each of the 13 pad tops, replace the dark glyph pixels with that pad's median grey.
  2. Erase the centre "containment + core" label the same way, using the left-face grey left of the drum seam and the right-face grey right of it, then redraw the vertical seam line (x≈1200).
  3. Pad to 2400×1600: add 50 rows above and 50 below, filled with the blockout's own background grey sampled from pixel (0,0), so there is no seam.
- **Background:** opaque plate, no keying. For gpt-image use the same prompt and attachment with `transparent_background=false`.
- **Recovery:**
  1. Scale the output uniformly to 2400×1600, then crop 50 rows top and bottom to get 2400×1500.
  2. Overlay the blockout's edges: both road edges, every spur bend and all 13 pad outlines. Reject the render on any doubled or shifted edge.
  3. Draw the border grid ticks by script on the cropped plate (#255375, 1 px, kept clear of the pads).

## CONTROL-ROOM prompt

```text
Ink the attached cutaway as the main control room of a commercial nuclear power plant. Do not design a new shell: reproduce the attachment edge to edge at the same scale and 30° isometric view, with no zoom, crop, shift or recentring. Trace both tall rear walls, their off-centre junction, the floor diamond and both low near walls at their exact heights and thicknesses. The V-shaped front lip is a foreground mask in the finished composition: leave its top and outer faces fully visible, with nothing crossing them.

A horseshoe of walk-up control boards stands against the rear walls: along the shorter left wall, round the rear corner and part-way along the longer right wall, open toward the viewer. The boards have sloped bench sections with upright panels above, carrying quiet bands of instruments, and one band of annunciator window tiles along the top, nearly all dark, a few dim cyan. On the right wall, directly beside the end of the boards and level with their upper panels, mount one plant overview mimic: a few fine interconnected lines and symbols.

Operators work standing at the boards, so leave a clear aisle in front of them. On the viewer's side of that aisle, on the horseshoe's centre line, place one compact shift supervisor's desk with two flat screens, a binder stand and two tucked-in chairs, facing the boards and the mimic. The desk stays wholly in the rear half of the floor. The entire near half is bare, flat, matte floor. The room is evenly lit and has no windows.

STYLE. Engineering-cutaway general-arrangement sheet. Flat matte fills: #091930 surfaces with one lighter and one darker step, #000e23 deepest shadow. Edges are #255375 hairlines; cut profiles are crisp pale-cyan hairlines, near-white only on short segments, never a continuous bright rim, no bloom. Centre lines are fine dash-dot. Fine 45° hatching only on cut material, never on floors or pad tops. Labels are tiny abstract dash-blocks. No people, no readable letters, numbers or logos, no warm colours or magenta. Mid-tones stay calm and low-contrast for the interface overlays drawn on top.

Screens and lit indicators are flat #3b95b7 or darker, with no bloom, halo or light on the floor. Add one faint dash-dot centre line up the interior rear corner; put no marks on the floor or outside the walls.

Everything outside the room silhouette is uniform flat #000e23: no shadow, halo, annotation, frame or checkerboard.
```

- **AspectRatio:** `1:1`
- **Attachment and preprocessing:** pad `refs/control-room-S.png` to 575×575 by adding 25 transparent rows below. Attach only that image in `ImagePaths`.
- **Background (Gemini, opaque JPEG):** flatten the padded blockout onto flat #000e23 before attaching, and use the prompt as written.
- **Background (gpt-image):** attach the padded blockout with its transparency intact, set `transparent_background=true`, and replace the last paragraph with: `Preserve the source transparency exactly: everything outside the room silhouette is fully transparent.`
- **Recovery:**
  1. Scale uniformly to 575×575, then crop the 25 added rows to get 575×550.
  2. Before masking, overlay the blockout's rear-wall junction and both edges of the V-shaped lip, including its apex. Reject any double or shifted edge; do not fix it by clipping.
  3. Apply the original blockout alpha as the final silhouette. Do not key on colour.

## WORK-BAY prompt

```text
Ink the attached work-bay blockout as a reusable plant engineering and work-planning office. Treat it as a registration drawing: reproduce it edge to edge at the same scale and 30° isometric view, with no zoom, crop, recentring or mirroring. Keep the rear corner, the long right wall, the shorter left wall, the floor corners, the wall heights and the slab thickness exactly as drawn. Keep both faces and the top of the low V-shaped front lip continuously visible; this edge will later hide the feet of crew figures.

The room holds exactly three fixtures. First, a straight engineering workstation bench against the longer right wall, with two adjacent work positions, modest monitors and keyboards, and chairs tucked under. At the bench's rear-corner end, one large drawing lies flat beside a short row of work-package binders shown as plain spines. Second, a wall-mounted piping-and-instrumentation drawing above the bench: a few branching lines, valve symbols and instrument bubbles. Third, a shallow vertical plan rack against the left wall, its hanging drawings shown edge-on in broad groups so it reads at small scale.

Keep the room strictly a clean engineering office containing only those three fixtures, all against the rear walls. The whole front half of the floor is bare, flat, matte standing space. The room is evenly lit.

STYLE. Engineering-cutaway general-arrangement sheet. Flat matte fills: #091930 surfaces with one lighter and one darker step, #000e23 deepest shadow. Edges are #255375 hairlines; cut profiles are crisp pale-cyan hairlines, near-white only on short segments, never a continuous bright rim, no bloom. Centre lines are fine dash-dot. Fine 45° hatching only on cut material, never on floors or pad tops. Labels are tiny abstract dash-blocks. No people, no readable letters, numbers or logos, no warm colours or magenta. Mid-tones stay calm and low-contrast for the interface overlays drawn on top.

Paper is the lighter flat step of #091930 and matte; only the monitors are flat #3b95b7 or darker, with no bloom, halo or light on the floor. Add one faint dash-dot centre line up the interior rear corner; put no marks on the floor or outside the walls.

Everything outside the room silhouette is uniform flat #000e23: no shadow, halo, annotation, frame or checkerboard.
```

- **AspectRatio:** `1:1`
- **Attachment and preprocessing:** pad `refs/work-bay-M.png` to 592×592 by adding 32 transparent rows below. Attach only that image in `ImagePaths`.
- **Background (Gemini, opaque JPEG):** flatten the padded blockout onto flat #000e23 before attaching, and use the prompt as written.
- **Background (gpt-image):** attach the padded blockout with its transparency intact, set `transparent_background=true`, and replace the last paragraph with: `Preserve the source transparency exactly: everything outside the room silhouette is fully transparent.`
- **Recovery:**
  1. Scale uniformly to 592×592, then crop the 32 added rows to get 592×560.
  2. Before masking, overlay the blockout's rear-wall junction and both edges of the V-shaped lip, including its apex. Reject any double or shifted edge; do not fix it by clipping.
  3. Apply the original blockout alpha as the final silhouette. Do not key on colour.

## Changes from final-v1

- **Style block (both critiques):** it is now asset-neutral, with near-white limited to short cut-profile segments and no bloom. Screen rules moved to the tiles without the "reactor core" comparison; ground and glow moved to SITE only.
- **SITE length and negative nouns (both):** scene text is cut from about 615 to about 340 words. The erasure paragraph and the lists of excluded buildings and security items are replaced by "add equipment only inside the containment" (codex 8, agy 8).
- **SITE label erasure and padding (codex 8, agy 2):** labels are erased on an input copy with the drum seam restored. Padding uses the blockout's own grey, the prompt no longer mentions padding bands, and border grid ticks are scripted after the crop.
- **SITE vessel and generators (agy 1, codex 4):** the vessel sits low with its head near floor level. The drum keeps its footprint and rear rim with a local near-side cut. The generators move to paired cubicles on the wide left and right flanks, and the front pair show a thin hatched shell with U-tube lines.
- **SITE loop piping (conflict resolved for agy 1):** all loop piping and the surge line stay below the floor, with only sectioned stubs at the shield cut. This also removes the "one hot leg for four generators" ambiguity codex 3 raised. Rejected: codex's exposed representative loop, because with the head at floor level the nozzles are below deck.
- **SITE ring, pads and crane (agy 3, agy 4, codex 1):** a luminance override stops the blockout's white ring line becoming a glow. Pads inside the ring are anchored explicitly, and the bottom-centre slab is described as overlapping the road at its near tip only. Rejected: agy's "astride the ring", which misreads the blockout. The crane girder now follows the rear half-wall only, and the hatches sit at floor level.
- **CONTROL-ROOM layout (both):** the separate operators' desk row is removed. Operators stand at the walk-up boards, with one aisle and one compact supervisor's desk on the centre line in the rear half; the mimic sits beside the end of the boards. Rejected: codex's seated positions built into the boards, because walk-up boards are the more recognisable arrangement.
- **WORK-BAY fixtures (both):** there are now exactly three fixtures, with the flat drawing and binders on the bench end, and the exclusion list is replaced by a positive sentence. Rejected: agy's flat-file cabinet with a shelf above, because the brief names drawing racks and that merge is still two fixtures on the short wall.
- **Tile exterior and marks (agy 6):** the Gemini flatten colour changes from #000000 to #000e23 to avoid dark JPEG fringing, since the mask comes from the blockout alpha. Wall-top dimension ticks are dropped, leaving only the interior corner centre line.
- **Recovery checks (codex 1, codex 2):** SITE overlays both road edges, all spur bends and all 13 pad outlines. Tiles overlay the rear-wall junction and both lip edges, including the apex, before the alpha mask, and any double edge is a reject.
