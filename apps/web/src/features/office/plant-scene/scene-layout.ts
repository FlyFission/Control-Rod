import type { Region, RegionId, StageLayout } from "../layout.js";
import { PLANT_LAYOUT } from "../plant-layout.js";
import { CANVAS, ROOMS } from "./geometry.js";

/**
 * The painted Plant's layout: the same 13 places and names as the plant layout, placed by the
 * blockout's room boxes and seat anchors (geometry.ts, generated). Seats are floor anchors on the
 * 2400 x 1500 canvas; there is no queue, so figures a room cannot hold are the view's overflow.
 */
const regions: Region[] = PLANT_LAYOUT.regions.map((r) => {
  const room = ROOMS[r.id];
  const [x0, y0, x1, y1] = room.bbox;
  return {
    ...r,
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
    seats: room.seats.map((s) => ({ x: s.x, y: s.y })),
    queue: [],
    door: { x: (x0 + x1) / 2, y: y1 },
  };
});

export const SCENE_LAYOUT: StageLayout = {
  id: "plant",
  canvas: CANVAS,
  regions,
  region: Object.fromEntries(regions.map((r) => [r.id, r])) as Record<RegionId, Region>,
};
