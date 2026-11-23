import {
  CUBE_SETS,
  type CubeSetId,
  FIGURE_SPAN,
  NAME_BAND,
  type Point,
  REGION,
  type Region,
  type RegionId,
  SEAT_CLEARANCE,
  type StageLayout,
  checkRegionGeometry,
  grid,
} from "./layout.ts";

/**
 * The plant's canonical layout (docs/superpowers/specs/2026-11-23-plant-view-design.md, section 5):
 * the same 13 places as the office, drawn as one site in plan. The application owns it, as it owns
 * the office's: a theme decorates inside these regions and the site, and can never move one.
 *
 * Outside in: the site, then the plant fence. Inside the fence, band 1 holds the main control room,
 * the reactor building (the core, no seats) and three rooms; band 2 is the auxiliary building, six
 * work bays in a row, each its own confinement cell. Outside the fence, band 3 holds the staging yard,
 * the records vault and the hold yard. Walkways run between the bands; the inner walkway leaves the
 * fence through a gate at each end onto the site road.
 *
 * Every coordinate below is derived from the shared clearance constants in layout.ts and checked by
 * validatePlantLayout; widths are chosen so the 1200 wide canvas keeps the office's 0.8 minimum zoom.
 */

export type ZoneId = "site" | "fence" | "auxiliary" | "reactor";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zone extends Rect {
  id: ZoneId;
  /** The zone's plain name, set into its boundary line. */
  name: string;
  /** What the boundary means here, for the legend and screen readers. */
  meaning: string;
  /** The zone this one sits inside; the site sits inside nothing. */
  within?: ZoneId;
}

export interface Walkway extends Rect {
  id: "inner" | "site-road" | "west-road" | "east-road";
  zone: ZoneId;
}

export interface Gate {
  /** Where the walkway crosses a boundary: a break in that boundary's line. */
  at: Point;
  boundary: ZoneId;
  joins: readonly [Walkway["id"], Walkway["id"]];
}

export interface PlantLayout extends StageLayout {
  id: "plant";
  zones: readonly Zone[];
  walkways: readonly Walkway[];
  gates: readonly Gate[];
  /** The zone each place sits inside. */
  zoneOf: Readonly<Record<RegionId, ZoneId>>;
  /** The reactor building's core: drawn, never a place. */
  core: Rect;
}

const WIDTH = 1200;
/** Space between the canvas edge and the fence: the site road runs here. */
const ROAD = 8;
/** Space between neighbouring regions. */
const GAP = 8;
/** A walkway is tall enough for a queued figure's full reach: 30 above, 36 below, plus a margin. */
const WALK_H = SEAT_CLEARANCE.above - 5 + SEAT_CLEARANCE.below + 4;
/** A two row grid needs the name band, both clearances and one figure span between rows. */
const TWO_ROWS = Math.ceil(NAME_BAND + SEAT_CLEARANCE.above + FIGURE_SPAN.y + SEAT_CLEARANCE.below) + 6;
/** A three column grid needs both side clearances and two figure spans. */
const THREE_COLS = Math.ceil(SEAT_CLEARANCE.left + SEAT_CLEARANCE.right + 2 * FIGURE_SPAN.x) + 1;
/** The wall between the auxiliary building and its bays. */
const AUX_WALL = 2;

const FENCE_X = ROAD;
const FENCE_Y = 14;
const FENCE_W = WIDTH - 2 * ROAD;
const INSIDE_X = FENCE_X + 6;
const INSIDE_W = FENCE_W - 12;

// Band 1, inside the fence.
const B1_Y = FENCE_Y + 30;
const B1_H = TWO_ROWS;
const CONTROL_W = 250;
const CORE_W = 280;
const ROOM_W = Math.floor((INSIDE_W - CONTROL_W - CORE_W - 4 * GAP) / 3);

// The inner walkway.
const WALK1_Y = B1_Y + B1_H + 4;

// Band 2: the auxiliary building and its six bays.
const AUX_Y = WALK1_Y + WALK_H + 4;
const BAY_H = 220;
const AUX_H = BAY_H + 2 * AUX_WALL + 4;
const BAY_GAP = 5;
const AUX_X = INSIDE_X;
const AUX_W = INSIDE_W;
const BAY_W = Math.floor((AUX_W - 2 * AUX_WALL - (CUBE_SETS.length - 1) * BAY_GAP) / CUBE_SETS.length);
const FENCE_H = AUX_Y + AUX_H + 6 - FENCE_Y;

// The site road, outside the fence, and band 3.
const WALK2_Y = FENCE_Y + FENCE_H + 4;
const B3_Y = WALK2_Y + WALK_H + 4;
const B3_H = TWO_ROWS;
const YARD_W = Math.floor((FENCE_W - 2 * GAP) / 3);
const HEIGHT = B3_Y + B3_H + 16;

const CANVAS = { width: WIDTH, height: HEIGHT } as const;

/** The plant label of each place: the second line of its plate. The functional name is always first. */
export const PLANT_LABELS: Readonly<Record<RegionId, string>> = {
  process: "Work bay",
  mechanical: "Work bay",
  electrical: "Work bay",
  civil: "Work bay",
  assurance: "Work bay",
  "project-controls": "Work bay",
  "your-office": "Main control room",
  verification: "Independent verification",
  interface: "Work control",
  review: "Review board",
  bench: "Staging yard",
  "document-control": "Records vault",
  quarantine: "Hold yard",
};

function room(id: RegionId, x: number, y: number, w: number, h: number, cols: number, rows: number, doorOn: "top" | "bottom", queue: readonly Point[] = []): Region {
  const base = REGION[id];
  const door = { x: Math.round(x + w / 2), y: doorOn === "top" ? y : y + h };
  return { ...base, x, y, w, h, seats: grid(x, y, w, h, cols, rows), queue, door };
}

function build(): PlantLayout {
  const regions: Region[] = [];
  // Band 1: control room, reactor building, verification, work control, review.
  let x = INSIDE_X;
  const controlDoor = Math.round(x + CONTROL_W / 2);
  // The control room seats four; the rest queue on the inner walkway, east of its door (the west road is too close).
  const walkMid = WALK1_Y + SEAT_CLEARANCE.above - 5 + Math.floor((WALK_H - (SEAT_CLEARANCE.above - 5) - SEAT_CLEARANCE.below) / 2);
  const queue = [1, 2, 3, 4, 5, 6].map((k) => ({ x: controlDoor + Math.round(k * (FIGURE_SPAN.x + 2)), y: walkMid }));
  regions.push(room("your-office", x, B1_Y, CONTROL_W, B1_H, 2, 2, "bottom", queue));
  x += CONTROL_W + GAP;
  const core = { x, y: B1_Y, w: CORE_W, h: B1_H };
  x += CORE_W + GAP;
  for (const id of ["verification", "interface", "review"] as const) {
    regions.push(room(id, x, B1_Y, ROOM_W, B1_H, 2, 2, "bottom"));
    x += ROOM_W + GAP;
  }
  // Band 2: the six bays, each 3 by 2, doors onto the inner walkway.
  CUBE_SETS.forEach((id: CubeSetId, i) => {
    const bx = AUX_X + AUX_WALL + i * (BAY_W + BAY_GAP);
    regions.push(room(id, bx, AUX_Y + AUX_WALL, BAY_W, BAY_H, 3, 2, "top"));
  });
  // Band 3, outside the fence: staging, records, hold. Doors onto the site road.
  x = FENCE_X;
  for (const id of ["bench", "document-control", "quarantine"] as const) {
    regions.push(room(id, x, B3_Y, YARD_W, B3_H, 4, 2, "top"));
    x += YARD_W + GAP;
  }
  // Keep the office's region order, so lists and tests read the same in both layouts.
  const order = Object.keys(REGION) as RegionId[];
  regions.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const zones: Zone[] = [
    { id: "site", name: "Site", meaning: "Outside the plant fence: queued work, accepted records and held work", x: 0, y: 0, w: WIDTH, h: HEIGHT },
    { id: "fence", name: "Plant fence", meaning: "Inside the fence: the control room, checks, decisions and the work bays", x: FENCE_X, y: FENCE_Y, w: FENCE_W, h: FENCE_H, within: "site" },
    { id: "auxiliary", name: "Auxiliary building", meaning: "The work bays: each agent works in its own confined bay, its worktree and sandbox", x: AUX_X, y: AUX_Y, w: AUX_W, h: AUX_H, within: "fence" },
    { id: "reactor", name: "Reactor building", meaning: "The core: lit while agents are working; its rods show any SCRAM in force", ...core, within: "fence" },
  ];
  const walkways: Walkway[] = [
    { id: "inner", zone: "fence", x: FENCE_X, y: WALK1_Y, w: FENCE_W, h: WALK_H },
    { id: "site-road", zone: "site", x: 0, y: WALK2_Y, w: WIDTH, h: WALK_H },
    { id: "west-road", zone: "site", x: 0, y: WALK1_Y, w: ROAD, h: WALK2_Y + WALK_H - WALK1_Y },
    { id: "east-road", zone: "site", x: WIDTH - ROAD, y: WALK1_Y, w: ROAD, h: WALK2_Y + WALK_H - WALK1_Y },
  ];
  const gateY = WALK1_Y + Math.round(WALK_H / 2);
  const gates: Gate[] = [
    { at: { x: FENCE_X, y: gateY }, boundary: "fence", joins: ["inner", "west-road"] },
    { at: { x: FENCE_X + FENCE_W, y: gateY }, boundary: "fence", joins: ["inner", "east-road"] },
  ];
  const zoneOf = Object.fromEntries(regions.map((r) => [r.id, (CUBE_SETS as readonly string[]).includes(r.id) ? "auxiliary" : r.y > FENCE_Y + FENCE_H ? "site" : "fence"])) as Record<RegionId, ZoneId>;
  return {
    id: "plant",
    canvas: CANVAS,
    regions,
    region: Object.fromEntries(regions.map((r) => [r.id, r])) as Record<RegionId, Region>,
    zones,
    walkways,
    gates,
    zoneOf,
    core,
  };
}

export const PLANT_LAYOUT: PlantLayout = build();

const contains = (outer: Rect, inner: Rect) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** Two rectangles meet when they overlap or share an edge. */
const meets = (a: Rect, b: Rect, slack = 0) => a.x <= b.x + b.w + slack && b.x <= a.x + a.w + slack && a.y <= b.y + b.h + slack && b.y <= a.y + a.h + slack;
const onEdge = (p: Point, r: Rect) =>
  ((p.x === r.x || p.x === r.x + r.w) && p.y >= r.y && p.y <= r.y + r.h) || ((p.y === r.y || p.y === r.y + r.h) && p.x >= r.x && p.x <= r.x + r.w);

/** A queued figure's full footprint around its centre: its reach above (no plate to clear), below and to each side. */
const footprint = (q: Point): Rect => ({ x: q.x - SEAT_CLEARANCE.left, y: q.y - (SEAT_CLEARANCE.above - 5), w: SEAT_CLEARANCE.left + SEAT_CLEARANCE.right, h: SEAT_CLEARANCE.above - 5 + SEAT_CLEARANCE.below });

/**
 * Checks the plant's invariants: the shared geometry, then zones (each inside the zone it names, the
 * site the canvas), every place inside its zone, every queue footprint wholly on a walkway of its
 * place's zone, every door on its region's edge and meeting a walkway, every gate on its boundary and
 * meeting both walkways it joins, every walkway reachable from every other, and nothing standing in
 * the reactor building.
 */
export function validatePlantLayout(layout: PlantLayout = PLANT_LAYOUT): string[] {
  const problems = checkRegionGeometry(layout.regions, layout.canvas);
  const zone = new Map(layout.zones.map((z) => [z.id, z]));
  const site = zone.get("site");
  if (!site || site.x !== 0 || site.y !== 0 || site.w !== layout.canvas.width || site.h !== layout.canvas.height) problems.push("the site is not the whole canvas");
  for (const z of layout.zones) {
    if (!z.name.trim()) problems.push(`the ${z.id} zone has no name`);
    if (z.within) {
      const outer = zone.get(z.within);
      if (!outer) problems.push(`the ${z.id} zone sits inside a zone that does not exist`);
      else if (!contains(outer, z)) problems.push(`the ${z.id} zone crosses the ${z.within} boundary`);
    }
  }
  for (let i = 0; i < layout.zones.length; i++)
    for (let j = i + 1; j < layout.zones.length; j++) {
      const a = layout.zones[i]!, b = layout.zones[j]!;
      // Zones either nest or stay apart; they never cross.
      if (overlaps(a, b) && !contains(a, b) && !contains(b, a)) problems.push(`the ${a.id} and ${b.id} zones cross`);
    }
  const reactor = zone.get("reactor");
  for (const r of layout.regions) {
    const z = zone.get(layout.zoneOf[r.id]);
    if (!z) {
      problems.push(`${r.id} sits in no zone`);
      continue;
    }
    if (!contains(z, r)) problems.push(`${r.id} is not wholly inside the ${z.id} zone`);
    // A place is in the innermost zone that holds it: the fence's rooms are not inside a building.
    for (const other of layout.zones) if (other.within === z.id && overlaps(other, r)) problems.push(`${r.id} reaches into the ${other.id} zone`);
    if (reactor && overlaps(reactor, r)) problems.push(`${r.id} stands in the reactor building`);
    for (const q of r.queue) {
      const f = footprint(q);
      const walk = layout.walkways.find((w) => contains(w, f));
      if (!walk) problems.push(`${r.id} queues off a walkway`);
      else if (walk.zone !== layout.zoneOf[r.id]) problems.push(`${r.id} queues outside its own zone`);
      if (reactor && overlaps(reactor, f)) problems.push(`${r.id} queues in the reactor building`);
      for (const other of layout.regions) if (overlaps(other, f)) problems.push(`${r.id} queues inside ${other.id}`);
    }
    if (!onEdge(r.door, r)) problems.push(`${r.id} has its door off its edge`);
    // A bay's door crosses the auxiliary building's wall to reach the walkway.
    const slack = layout.zoneOf[r.id] === "auxiliary" ? AUX_WALL + 4 : 4;
    const doorBox = { x: r.door.x, y: r.door.y, w: 0, h: 0 };
    if (!layout.walkways.some((w) => w.zone === (layout.zoneOf[r.id] === "auxiliary" ? "fence" : layout.zoneOf[r.id]) && meets(w, doorBox, slack))) problems.push(`${r.id} has no walkway at its door`);
  }
  // Walkways join where they meet inside one zone, or through a gate in the boundary between zones.
  const ids = layout.walkways.map((w) => w.id);
  const links = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const a of layout.walkways)
    for (const b of layout.walkways)
      if (a !== b && a.zone === b.zone && meets(a, b)) links.get(a.id)!.add(b.id);
  for (const g of layout.gates) {
    const boundary = zone.get(g.boundary);
    if (!boundary || !onEdge(g.at, boundary)) problems.push(`a gate is not on the ${g.boundary} boundary`);
    const [a, b] = g.joins.map((id) => layout.walkways.find((w) => w.id === id));
    const point = { x: g.at.x, y: g.at.y, w: 0, h: 0 };
    if (!a || !b || !meets(a, point) || !meets(b, point)) {
      problems.push(`a gate on the ${g.boundary} boundary does not join ${g.joins.join(" and ")}`);
      continue;
    }
    links.get(a.id)!.add(b.id);
    links.get(b.id)!.add(a.id);
  }
  const seen = new Set<string>([ids[0]!]);
  const todo: string[] = [ids[0]!];
  while (todo.length) for (const n of links.get(todo.pop()!) ?? []) if (!seen.has(n)) (seen.add(n), todo.push(n));
  for (const id of ids) if (!seen.has(id)) problems.push(`the ${id} walkway cannot be reached from the others`);
  return problems;
}

/** Seats and queue places across the whole plant. */
export const PLANT_CAPACITY = PLANT_LAYOUT.regions.reduce((n, r) => n + r.seats.length + r.queue.length, 0);
