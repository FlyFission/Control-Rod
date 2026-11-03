/**
 * The office's canonical layout graph (specification 13 and 18; plan task 4.1). The application owns
 * it: the six cube sets and seven rooms, their seat and door anchors, the walking corridor that joins
 * them, and every room's functional name. A theme only decorates inside these regions; it can never
 * move, resize or rename one.
 *
 * Coordinates are in layout units on a fixed canvas; the renderer scales the whole canvas.
 */

export const CANVAS = { width: 1200, height: 640 } as const;

/** The six cube sets, one per discipline group, where agents do the work. */
export const CUBE_SETS = [
  "process",
  "mechanical",
  "electrical",
  "civil",
  "assurance",
  "project-controls",
] as const;

/** The seven rooms where work waits, is checked, decided, filed or held. */
export const ROOMS = ["review", "interface", "verification", "your-office", "document-control", "bench", "quarantine"] as const;

export type CubeSetId = (typeof CUBE_SETS)[number];
export type RoomId = (typeof ROOMS)[number];
export type RegionId = CubeSetId | RoomId;
export const REGION_IDS: readonly RegionId[] = [...CUBE_SETS, ...ROOMS];

export interface Point {
  x: number;
  y: number;
}

export interface Region {
  id: RegionId;
  kind: "cube-set" | "room";
  /** The canonical functional name, always drawn by the semantic layer beside any themed label. */
  name: string;
  /** What happens here, for screen readers and the legend. */
  purpose: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where figures sit or stand inside the region, in order of preference. */
  seats: readonly Point[];
  /** Where figures queue just outside the door when every seat is taken (Your office, OV-01). */
  queue: readonly Point[];
  /** The door, on the corridor side. */
  door: Point;
}

/** The band at the top of each region that holds its name plate (two lines, 40px at minimum zoom); no figure reaches into it. */
export const NAME_BAND = 50;

const CUBE_NAMES: Record<CubeSetId, [string, string]> = {
  // Short names fit a name plate at minimum zoom; the purpose carries the full discipline group.
  process: ["Process", "Process design and simulation"],
  mechanical: ["Mechanical", "Mechanical, piping and HVAC design"],
  electrical: ["Electrical", "Electrical, instrumentation and controls design"],
  civil: ["Civil", "Civil, structural and architectural design"],
  assurance: ["Assurance", "Quality, safety and regulatory work"],
  "project-controls": ["Project controls", "Project management, schedules and cost"],
};

const ROOM_NAMES: Record<RoomId, [string, string, number]> = {
  // name, purpose, width
  review: ["Review", "Disputes and loops a person rules on", 160],
  interface: ["Interface", "Work waiting on another discipline's input", 150],
  verification: ["Verification", "Independent pre-checks", 170],
  "your-office": ["Your office", "Decisions and permissions waiting on you", 210],
  "document-control": ["Document control", "Accepted records and transmittals", 160],
  bench: ["Bench", "Queued work and agents waiting their turn", 150],
  quarantine: ["Quarantine", "Security holds and work SCRAM stopped", 140],
};

const MARGIN = 18;
const GAP = 6;
const TOP_Y = 20;
const TOP_H = 220;
const CORRIDOR_Y = 280;
const BOTTOM_Y = 320;
const BOTTOM_H = 300;

/**
 * A grid of seats below the name band, cols by rows, inset from the walls. A seat is a figure's
 * centre: at minimum zoom (0.8) the figure reaches 18px above it, 28px below it (its package code),
 * 20.5px to its left (a six character code) and 23px to its right (the state mark), which is 22.5,
 * 35, 25.6 and 28.75 layout units; SEAT_CLEARANCE rounds those up, so the insets keep every figure
 * clear of the name plate and inside its region. The quality harness measures the real extents.
 */
export const SEAT_CLEARANCE = { above: 24, below: 36, left: 26, right: 30 } as const;

function grid(x: number, y: number, w: number, h: number, cols: number, rows: number): Point[] {
  const top = y + NAME_BAND + SEAT_CLEARANCE.above;
  const usable = h - NAME_BAND - SEAT_CLEARANCE.above - SEAT_CLEARANCE.below;
  // Columns run from the first seat a figure fits at to the last, never centred in equal cells.
  const left = x + SEAT_CLEARANCE.left;
  const across = w - SEAT_CLEARANCE.left - SEAT_CLEARANCE.right;
  const out: Point[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      out.push({ x: Math.round(left + (cols === 1 ? across / 2 : (across * c) / (cols - 1))), y: Math.round(top + (rows === 1 ? usable / 2 : (usable * r) / (rows - 1))) });
  return out;
}

function buildRegions(): Region[] {
  const regions: Region[] = [];
  const cubeW = (CANVAS.width - 2 * MARGIN - GAP * (CUBE_SETS.length - 1)) / CUBE_SETS.length;
  CUBE_SETS.forEach((id, i) => {
    const x = Math.round(MARGIN + i * (cubeW + GAP));
    const w = Math.round(cubeW);
    const [name, purpose] = CUBE_NAMES[id];
    regions.push({ id, kind: "cube-set", name, purpose, x, y: TOP_Y, w, h: TOP_H, seats: grid(x, TOP_Y, w, TOP_H, 3, 2), queue: [], door: { x: Math.round(x + w / 2), y: TOP_Y + TOP_H } });
  });
  let x = MARGIN;
  for (const id of ROOMS) {
    const [name, purpose, w] = ROOM_NAMES[id];
    // Your office seats four; the rest queue at its door (OV-01). Rows of three keep figures apart at minimum zoom.
    const seats = id === "your-office" || id === "quarantine" ? grid(x, BOTTOM_Y, w, BOTTOM_H, 2, 2) : grid(x, BOTTOM_Y, w, BOTTOM_H, 2, 3);
    const door = { x: Math.round(x + w / 2), y: BOTTOM_Y };
    // The queue runs along the corridor, either side of the door, spaced so figures and their
    // package codes never touch, and high enough that codes clear the rooms' name plates.
    const queue = id === "your-office" ? [-64, 64, -128, 128, -192, 192].map((dx) => ({ x: door.x + dx, y: CORRIDOR_Y - 10 })) : [];
    regions.push({ id, kind: "room", name, purpose, x, y: BOTTOM_Y, w, h: BOTTOM_H, seats, queue, door });
    x += w + GAP;
  }
  return regions;
}

export const REGIONS: readonly Region[] = buildRegions();
export const REGION: Readonly<Record<RegionId, Region>> = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, Region>;

/** The walking route between two regions: out of one door, along the corridor, into the other. */
export function route(from: RegionId, to: RegionId): Point[] {
  const a = REGION[from].door;
  const b = REGION[to].door;
  if (from === to) return [a];
  return [a, { x: a.x, y: CORRIDOR_Y }, { x: b.x, y: CORRIDOR_Y }, b];
}

/**
 * Checks the graph's invariants: every region inside the canvas and clear of every other, every seat
 * and queue point inside its own region (or, for queues, on the corridor) and clear of the name band,
 * every door on its region's corridor edge, and every region reachable from every other.
 */
export function validateLayout(regions: readonly Region[] = REGIONS): string[] {
  const problems: string[] = [];
  const inside = (p: Point, r: { x: number; y: number; w: number; h: number }) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const ids = new Set<string>();
  for (const r of regions) {
    if (!(REGION_IDS as readonly string[]).includes(r.id)) problems.push(`${r.id} is not a region of the office`);
    else if (r.kind !== ((CUBE_SETS as readonly string[]).includes(r.id) ? "cube-set" : "room")) problems.push(`${r.id} has the wrong kind`);
    if (ids.has(r.id)) problems.push(`${r.id} appears twice`);
    ids.add(r.id);
    if (r.x < 0 || r.y < 0 || r.x + r.w > CANVAS.width || r.y + r.h > CANVAS.height) problems.push(`${r.id} leaves the canvas`);
    if (r.w <= 0 || r.h <= NAME_BAND + 48) problems.push(`${r.id} is too small to seat anyone`);
    if (!r.name.trim()) problems.push(`${r.id} has no functional name`);
    for (const s of r.seats) {
      if (!inside(s, r)) problems.push(`${r.id} has a seat outside it`);
      if (s.y - SEAT_CLEARANCE.above < r.y + NAME_BAND) problems.push(`${r.id} has a seat under its name plate`);
      if (s.y + SEAT_CLEARANCE.below > r.y + r.h) problems.push(`${r.id} has a seat too close to its far wall`);
      if (s.x - SEAT_CLEARANCE.left < r.x || s.x + SEAT_CLEARANCE.right > r.x + r.w) problems.push(`${r.id} has a seat too close to a side wall`);
    }
    for (const q of r.queue) {
      if (q.y - SEAT_CLEARANCE.above <= TOP_Y + TOP_H || q.y + SEAT_CLEARANCE.below >= BOTTOM_Y || q.x < 0 || q.x > CANVAS.width) problems.push(`${r.id} queues outside the corridor`);
    }
    const onEdge = r.kind === "cube-set" ? r.door.y === r.y + r.h : r.door.y === r.y;
    if (!onEdge || r.door.x < r.x || r.door.x > r.x + r.w) problems.push(`${r.id} has its door off its corridor edge`);
  }
  for (const id of REGION_IDS) if (!ids.has(id)) problems.push(`${id} is missing`);
  for (let i = 0; i < regions.length; i++)
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i]!;
      const b = regions[j]!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) problems.push(`${a.id} overlaps ${b.id}`);
    }
  // Reachability: every door touches the corridor, which spans the canvas, so every route is a path
  // door, corridor, door; check each route stays inside the canvas and ends at its target's door.
  // Routes are walked only once every region is known, so a malformed graph returns problems, never throws.
  if (problems.some((p) => p.endsWith("is not a region of the office"))) return problems;
  for (const a of regions)
    for (const b of regions) {
      const path = route(a.id, b.id);
      if (path.some((p) => p.x < 0 || p.x > CANVAS.width || p.y < 0 || p.y > CANVAS.height)) problems.push(`the route ${a.id} to ${b.id} leaves the canvas`);
      const end = path[path.length - 1]!;
      if (end.x !== b.door.x || end.y !== b.door.y) problems.push(`the route ${a.id} to ${b.id} does not reach its door`);
    }
  return problems;
}

/** Seats and queue places across the whole office: the floor must hold at least 40 figures before folding. */
export const CAPACITY = REGIONS.reduce((n, r) => n + r.seats.length + r.queue.length, 0);
