import type { Region, RegionId, StageLayout } from "../layout.js";
import { PLANT_LAYOUT } from "../plant-layout.js";
import { CANVAS, ROOMS } from "./geometry.js";

/**
 * The painted Plant's layout, one region per room in the geometry (however many it holds), placed by
 * the blockout's room boxes and seat anchors (geometry.ts, generated). A room the plant layout
 * already names keeps its name and purpose; a new room gets its id as a name until one is written,
 * so adding a room to the geometry needs no code change. Seats are floor anchors on the canvas;
 * there is no queue, so figures a room cannot hold are the view's overflow.
 */
const known = new Map<string, Region>(PLANT_LAYOUT.regions.map((r) => [r.id, r]));

/** "project-controls" as "Project controls": a readable name for a room nobody has named yet. */
export const humanize = (id: string) => {
  const s = id.replace(/[-_]+/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const regions: Region[] = Object.entries(ROOMS).map(([id, room]) => {
  const meta = known.get(id);
  const [x0, y0, x1, y1] = room.bbox;
  return {
    id: id as RegionId,
    kind: meta?.kind ?? "room",
    name: meta?.name ?? humanize(id),
    purpose: meta?.purpose ?? "",
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
