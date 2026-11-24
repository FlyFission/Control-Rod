# Hybrid layers: how the Plant is drawn and how to add a room

The Plant is cut from three styled frames (`design/art/source/hybrid/frame-{dark,lit,tripped}.webp`, 2400 x 1500) and one worker sheet. Each frame was rendered in Blender (geometry, one orthographic camera) and then run through a style pass that registers at 0 px to the render, so the Blender masks cut the styled pixels exactly. `design/art/source/hybrid/PROMPTS.md` records the style pass, the registration numbers and the input digests. Nothing here is typed by hand: `tools/cut_plant_layers.py` computes every offset, size, seat and digest.

## What ships (`apps/web/public/plant/`)

| File | What it is | Cut from |
|---|---|---|
| `base.webp`, `base-1440.webp` | the whole site, rooms unlit, core healthy | frame-dark |
| `rooms/<room>-lit.webp` | the room lit, cropped to its silhouette | frame-lit under `masks/<room>-lit.png` |
| `rooms/<room>-front.webp` | what stands in front of the seats (desk fronts, walls), drawn over the figures | frame-lit under `masks/<room>-front.png` |
| `core-healthy.webp`, `core-tripped.webp` | the containment, swapped on a SCRAM | frame-dark / frame-tripped under the grown, feathered core mask |
| `sprites/<garb>-<pose>.webp` | one worker, 256 px; garb is `station` or `antic`, pose is working, waiting, stuck or needs-you | `workers-sheet.webp`, 512 px cells, poses across, garbs down |
| `manifest.json` | offset, size, bytes, sha256 of every output; sha256 of every input; the quality chosen; the byte budget | |

The stack, back to front, is: base, core, then per room (back to front) its lit layer, its figures, its front layer. A room is lit when it holds an agent, so the front layer is cut from frame-lit. Walking is cut and recorded in the manifest (`not_shipped`) but not shipped: the app has no walking state.

Seats: `masks/seat-feet.json` (from Blender) gives each seat's floor point in plate pixels. A sprite is placed so its hip anchor pixel (`SPRITE_ANCHOR` in the generated `geometry.ts`) lands on the seat, at the render's own scale (6 sprite px per plate px) times `FIGURE_SCALE` in `figure-layout.ts`, a readability magnification.

## Add a room

1. Blender (`tools/plant3d/`): add the room to the layout and `scene_consts.py`, render with `layers.py` and finish with `post3.py`. That writes `layers/rooms/<room>-lit.png` and `-front.png` (the room's silhouette and its front occluders as alpha), `sprites/`, `seat-feet.json` and `manifest.json` (with the garb table). Add the room to `design/art/blockout/anchors.json` as well (it holds the room list and archetype).
2. Style pass: re-run it over the new frame-dark, frame-lit and frame-tripped as recorded in `design/art/source/hybrid/PROMPTS.md`, then lock frame-lit to frame-dark outside the rooms and frame-tripped outside the containment, and check registration at 0 px per room. Replace the three frames in `design/art/source/hybrid/`.
3. Cut: `python3 tools/cut_plant_layers.py --ingest <plant3d-v3 output dir>` copies the alpha masks, `seat-feet.json` and the garb table into `design/art/source/hybrid/masks/` with digests, cuts every layer, picks the WebP quality that fits the budget, writes `manifest.json` and regenerates `apps/web/src/features/office/plant-scene/geometry.ts`. Without `--ingest` it cuts from the copies already in the repository.
4. Check: `cd apps/web && pnpm -s vitest run` (the manifest tests compare files, digests, offsets and the budget), then the contrast script and a look at screenshots of each state.

The app needs no change for a new room: the scene, the semantic layer and the layout read the room list from `geometry.ts`.

## Budget

`apps/web/public/plant/` must stay at or under 1,500,000 bytes. The cutter bisects one WebP quality for every file so the directory fits 1,400,000 bytes (the rest is headroom) and records it in the manifest.
