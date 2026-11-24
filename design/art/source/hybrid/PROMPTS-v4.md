# Style pass v4: Blender v4 frames (sectioned reactor, larger workers; crane as in commit 84951b01)

Run this on the Mac in place of `PROMPTS.md` / `design/art/bakeoff/prompts/style-pass-v2.md` for the Blender v4 frames (`plant3d-v4/`). The method, framing, run order, lock step and checks are the v2 ones and are not repeated here; read `style-pass-v2.md` first. Two things changed in the Blender scene on top of the scene at commit 84951b01 (taller rear wall, phantom bridge with hook block), and this brief tells the image model to keep them:

1. **Reactor.** The core is a sectioned cylindrical vessel: the near quadrant is cut flush through the fuel, so you see the vessel shell, the core barrel as hatched cut rings, and a grid of square fuel assemblies seen from above at the cut plane. The head with its control-rod-drive housings stands on the rest of the vessel behind. The glow lives only on the flush assembly grid, inside the vessel. It is no longer a wedge or chevron of vertical glowing faces.
2. **Workers.** Figures are drawn 1.5x larger in the sprite sheet (chairs grow with them). The app no longer needs its 1.5x stopgap. Garb is unchanged ("realistic": white anti-contamination coveralls only in radiologically controlled rooms, station coveralls elsewhere).

The polar crane is unchanged from 84951b01: keep whatever the current style-pass-v2 treatment does for the phantom bridge, trolley and hook block, and keep them exactly where they are. Everything else in the frames is as before: camera, room positions, masks, site, rooms, SCRAM lamps.

## What to change in the v2 prompts

### DARK frame

Replace "including room corners, desk fronts, chair seats, the crane girder, the vessel cut and the assembly pattern" with "including room corners, desk fronts, chair seats, the crane girder, bridge, trolley and hook block, the vessel cut outline and the square assembly grid".

Replace the "Core:" paragraph with:

```text
Core: keep its outline exactly. It is a sealed PWR reactor vessel, a round cylinder sectioned on the near quadrant. Keep the vessel shell, the core barrel and the pressure-vessel rim as hatched cut rings (45 degree hatching, pale cyan cut line #7ccae6), keep the step down to the cut plane, and keep the flush grid of square fuel assemblies seen from above at the cut, each a crisp upright square. Keep the head and the control-rod-drive housings above and behind, on the uncut part of the vessel. Light only the flush assembly grid, as a schematic power-state overlay in Cherenkov blue #6bd8f0 with #b8f2ff square-top highlights, bright but never clipped flat white, with no pool caustics, no water surface and no spill beyond the vessel rim except a restrained cyan spill on the shield cut faces immediately around it. Do not turn the grid into a wedge, a chevron, a pyramid or glowing vertical faces. The vessel must read as a round cylinder and the assemblies as a square grid. It is the brightest thing in the image.
```

### LIT frame

Add after "...containment, core, crane and exterior wall faces": "(the crane trolley and hook block included)". No other change.

### TRIPPED frame

Replace "Do not draw or move control rods or drive heads." with "Do not draw or move control rods or drive heads, and keep the crane, trolley, hook block and the vessel and assembly outline exactly as in the styled dark frame." The flush assembly grid is the part that loses its cyan glow: leave it as readable dark steel-blue squares, outline unchanged.

### WORKERS sheet

Keep the v2 prompt and add: "The figures are about one and a half times larger on the sheet than in the previous sheet; keep every silhouette, pose, size and pixel position exactly as drawn. Seated figures sit on their own chair and the chair is not in the sheet."

## Checks to add on the Mac

- Core: the lit area must be the flush square grid only, inside the vessel rim. No bright wedge, chevron or glowing vertical faces. The hatched cut rings and the step must survive.
- Crane: trolley and hook block present and unmoved.
- Everything else: the v2 checks (registration at 0 px per room, pixel identity outside the change regions, warm-colour check, worker sheet checks).

The Blender inputs for this run are in `plant3d-v4/` on the project drive; the registration record is `plant3d-v4/registration.json` and `plant3d-v4/REGISTRATION.md`. When cutting, `tools/cut_plant_layers.py --ingest` picks up the new sprite scale (`px_per_plate_px` is now 4, from 6) and regenerates `geometry.ts`; then `FIGURE_SCALE` in `figure-layout.ts` can return to 1.0.
