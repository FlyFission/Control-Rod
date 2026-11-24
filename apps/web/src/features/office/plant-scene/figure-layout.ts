import type { FigureState } from "../OfficeStage.js";
import { CANVAS, CREW_BASELINE, CREW_FRAME, ROOMS } from "./geometry.js";

/**
 * Where everything the Plant writes on the picture goes, worked out from the room geometry and the
 * scene's scale, with no constants tied to a window width. The painted crew and the text over it
 * are sized differently on purpose: the crew scales with the picture (so a bigger window draws
 * bigger figures), the text does not (it stays at its token size), so what fits in a room is a
 * question of the scale, answered here:
 *
 *  - Wide enough for a figure to read (about 40 px or more): each room's figures stand at its seats
 *    in order of need, each with a nameplate under it; the ones that fit are drawn and the rest are
 *    stacked behind a "+N" button, never overlapping.
 *  - Narrower: figures are not drawn at all; each room shows one count plate (by state) instead.
 *
 * All sizes below are screen px, positions are px from the canvas's top left. The same function
 * runs in the app and in its unit test, so "no label overlaps another or a room edge" is checked on
 * exactly what is drawn. Rooms come from the geometry, however many it holds.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Label sizes in px (the fonts are the --fs-* tokens; these are the boxes they are set in). */
export const METRICS = {
  /** A nameplate: as wide as its room allows up to `w`, never under `minW`; two rows tall. */
  plate: { w: 112, minW: 84, h: 34 },
  stack: { w: 42, h: 24 },
  micro: { w: 32, h: 20 },
  countW: 92,
  countRow: 16,
  countPad: 6,
  labelH: 20,
  /** An average glyph at the label size, plus the plate's padding and border, for a label's width. */
  labelChar: 7,
  labelPad: 16,
  /** The least gap between two labels, and the least between a label and a room edge. */
  gap: 3,
  margin: 3,
  /** A crew frame in canvas units, and how much of the frame the figure fills (top of head to feet). */
  crewFrame: 140,
  crewFill: 0.92,
  crewMax: 104,
  /** Below this a figure is too small to read: the scene switches to count plates. */
  lodFigure: 40,
  /** The figure's width as a share of its frame, for keeping plates off other figures. */
  bodyShare: 0.5,
} as const;

/** What most needs the viewer comes first, so the figures that do not fit are the quiet ones. */
export const PRIORITY: readonly FigureState[] = ["needs", "stuck", "changed", "waiting", "working"];

export interface PlanFigure {
  id: string;
  region: string;
  state: FigureState;
}

export interface PlanInput {
  figures: readonly PlanFigure[];
  /** Agents on the floor that are not in `figures` (over a room's seats); counted in its stack. */
  extra?: readonly { region: string; state: FigureState }[];
  /** Healthy agents folded into counts, per room: only a count plate shows them. */
  folded?: ReadonlyMap<string, number>;
  /** Screen px per canvas unit: the scene's width divided by CANVAS.width. */
  u: number;
  /** A room's name, for its label. */
  name: (room: string) => string;
}

export interface Placed {
  id: string;
  state: FigureState;
  seat: { x: number; y: number };
  /** The figure's standing body, for keeping plates off it. */
  body: Rect;
  /** The crew frame (the painted image), square, standing its baseline on the seat. */
  frame: Rect;
  plate: Rect;
  /** The button's box: the body and the plate together. */
  box: Rect;
  /** Which side of the figure its full-name tooltip opens, away from the picture's nearest edge. */
  tip: "above" | "below";
  /** How the tooltip lines up with the button, so it stays inside the picture at the left and right edges. */
  align: "start" | "center" | "end";
}

export interface RoomPlan {
  id: string;
  name: string;
  box: Rect;
  /** Everyone in the room, drawn or not. */
  total: number;
  byState: [FigureState, number][];
  placed: Placed[];
  /** Figures that did not fit, by id, in order of need. */
  hidden: string[];
  /** How many the "+N" stands for: hidden figures and those over the room's seats. */
  more: number;
  stack?: Rect;
  count?: { rect: Rect; tier: "full" | "micro" };
  label?: Rect;
}

export interface ScenePlan {
  u: number;
  mode: "figures" | "counts";
  /** The crew frame's side in px (zero in count mode). */
  frame: number;
  rooms: RoomPlan[];
}

export const intersects = (a: Rect, b: Rect, gap = 0) => a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
const within = (r: Rect, outer: Rect, m: number) => r.x >= outer.x + m && r.y >= outer.y + m && r.x + r.w <= outer.x + outer.w - m && r.y + r.h <= outer.y + outer.h - m;
const union = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

/** One room's box in px, from the geometry. */
export const roomBox = (id: string, u: number): Rect => {
  const [x0, y0, x1, y1] = ROOMS[id as keyof typeof ROOMS].bbox;
  return { x: x0 * u, y: y0 * u, w: (x1 - x0) * u, h: (y1 - y0) * u };
};

/** The crew frame's side in px at this scale. */
export const frameAt = (u: number) => Math.min(METRICS.crewMax, METRICS.crewFrame * u);

/** Figures or counts: figures only where one reads and every room can hold a nameplate. */
export function modeAt(u: number): "figures" | "counts" {
  const narrowest = Math.min(...Object.values(ROOMS).map((r) => (r.bbox[2] - r.bbox[0]) * u));
  const readable = frameAt(u) * METRICS.crewFill >= METRICS.lodFigure;
  return readable && narrowest >= METRICS.plate.minW + 2 * METRICS.margin ? "figures" : "counts";
}

/** A plate's width in a room of this box: the nominal width, or what the room leaves it. */
export const plateWidth = (room: Rect) => Math.max(METRICS.plate.minW, Math.min(METRICS.plate.w, room.w - 2 * METRICS.margin));

export function labelWidth(text: string): number {
  return Math.ceil(text.length * METRICS.labelChar + METRICS.labelPad);
}

export function planScene(input: PlanInput): ScenePlan {
  const { u } = input;
  const mode = modeAt(u);
  const frame = mode === "figures" ? frameAt(u) : 0;
  const canvas: Rect = { x: 0, y: 0, w: CANVAS.width * u, h: CANVAS.height * u };
  const ids = Object.keys(ROOMS);
  const boxes = new Map(ids.map((id) => [id, roomBox(id, u)]));

  const rooms: RoomPlan[] = ids.map((id) => {
    const box = boxes.get(id)!;
    const mine = input.figures.filter((f) => f.region === id).sort((a, b) => PRIORITY.indexOf(a.state) - PRIORITY.indexOf(b.state));
    const extra = (input.extra ?? []).filter((f) => f.region === id);
    const folded = input.folded?.get(id) ?? 0;
    const counts = new Map<FigureState, number>();
    for (const f of [...mine, ...extra]) counts.set(f.state, (counts.get(f.state) ?? 0) + 1);
    if (folded > 0) counts.set("working", (counts.get("working") ?? 0) + folded);
    const byState = PRIORITY.filter((s) => counts.has(s)).map((s) => [s, counts.get(s)!] as [FigureState, number]);
    const total = byState.reduce((n, [, c]) => n + c, 0);
    const plan: RoomPlan = { id, name: input.name(id), box, total, byState, placed: [], hidden: [], more: 0 };
    if (total === 0) return plan;
    if (mode === "counts") {
      plan.count = countPlate(box, byState);
      plan.more = 0;
      return plan;
    }
    const seats = ROOMS[id as keyof typeof ROOMS].seats.map((s) => ({ x: s.x * u, y: s.y * u }));
    const attempt = (reserve?: Rect) => {
      const placed: Placed[] = [];
      const used = new Set<number>();
      const left: PlanFigure[] = [];
      for (const f of mine) {
        let done = false;
        for (let i = 0; i < seats.length && !done; i++) {
          if (used.has(i)) continue;
          const c = candidate(f, seats[i]!, frame, box, canvas);
          if (!c || !fits(c, placed, reserve)) continue;
          placed.push(c);
          used.add(i);
          done = true;
        }
        if (!done) left.push(f);
      }
      return { placed, left };
    };
    let best = attempt();
    let stack: Rect | undefined;
    if (best.left.length > 0 || extra.length > 0) {
      let pick: Rect | undefined;
      let bestN = -1;
      for (const c of stackSpots(box)) {
        const a = attempt(c);
        if (a.placed.length > bestN) {
          best = a;
          bestN = a.placed.length;
          pick = c;
        }
      }
      stack = pick;
    }
    plan.placed = best.placed;
    plan.hidden = best.left.map((f) => f.id);
    plan.more = best.left.length + extra.length;
    if (stack) plan.stack = stack;
    return plan;
  });

  // Room names last, so a name that has nowhere clear to go is left off (its room still has its
  // accessible name and, in count mode, its count plate); a name never overlaps anything.
  const taken: Rect[] = [];
  const order = [...rooms].sort((a, b) => Number(b.total > 0) - Number(a.total > 0));
  for (const r of order) {
    const w = labelWidth(r.name);
    const h = METRICS.labelH;
    const cx = r.box.x + r.box.w / 2;
    const spots: Rect[] = [];
    for (const side of ["below", "above"] as const) {
      const y = side === "below" ? r.box.y + r.box.h + METRICS.margin : r.box.y - METRICS.margin - h;
      spots.push({ x: cx - w / 2, y, w, h }, { x: r.box.x, y, w, h }, { x: r.box.x + r.box.w - w, y, w, h });
    }
    const others = rooms.filter((o) => o !== r).map((o) => o.box);
    const ok = spots.find((s) => within(s, canvas, 1) && !intersects(s, r.box, METRICS.margin - 1) && others.every((b) => !intersects(s, b, METRICS.margin - 1)) && taken.every((t) => !intersects(s, t, METRICS.gap)));
    if (ok) {
      r.label = ok;
      taken.push(ok);
    }
  }
  return { u, mode, frame, rooms };
}

function candidate(f: PlanFigure, seat: { x: number; y: number }, frame: number, room: Rect, canvas: Rect): Placed | undefined {
  const p = { w: plateWidth(room), h: METRICS.plate.h };
  const bw = frame * METRICS.bodyShare;
  const bh = frame * METRICS.crewFill;
  const body: Rect = { x: seat.x - bw / 2, y: seat.y - bh, w: bw, h: bh };
  const px = Math.min(Math.max(seat.x - p.w / 2, room.x + METRICS.margin), room.x + room.w - METRICS.margin - p.w);
  const plate: Rect = { x: px, y: seat.y + METRICS.gap, w: p.w, h: p.h };
  if (!within(plate, room, METRICS.margin)) return undefined;
  const top = frame * (CREW_BASELINE / CREW_FRAME);
  const img: Rect = { x: seat.x - frame / 2, y: seat.y - top, w: frame, h: frame };
  const all = union(body, plate);
  return { id: f.id, state: f.state, seat, body, frame: img, plate, box: all, tip: seat.y < canvas.h / 2 ? "below" : "above", align: seat.x < 130 ? "start" : seat.x > canvas.w - 130 ? "end" : "center" };
}

function fits(c: Placed, placed: readonly Placed[], reserve: Rect | undefined): boolean {
  const g = METRICS.gap;
  for (const p of placed) {
    if (intersects(c.plate, p.plate, g) || intersects(c.plate, p.body, 0) || intersects(c.body, p.plate, 0)) return false;
  }
  return !reserve || (!intersects(c.plate, reserve, g) && !intersects(c.body, reserve, 0));
}

/** Where a "+N" button may stand in a room: its corners first, then along the foot. */
function stackSpots(box: Rect): Rect[] {
  const { w, h } = METRICS.stack;
  const m = METRICS.margin;
  const xs = [box.x + box.w - m - w, box.x + m, box.x + (box.w - w) / 2];
  const ys = [box.y + box.h - m - h, box.y + m];
  return ys.flatMap((y) => xs.map((x) => ({ x, y, w, h })));
}

function countPlate(box: Rect, rows: readonly [FigureState, number][]): { rect: Rect; tier: "full" | "micro" } {
  const full = { w: METRICS.countW, h: rows.length * METRICS.countRow + METRICS.countPad };
  const small = METRICS.micro;
  const centre = (s: { w: number; h: number }): Rect => ({ x: box.x + (box.w - s.w) / 2, y: box.y + (box.h - s.h) / 2, w: s.w, h: s.h });
  const rect = centre(full);
  if (within(rect, box, METRICS.margin)) return { rect, tier: "full" };
  return { rect: centre(small), tier: "micro" };
}

/** Every label the plan draws, with its kind: what the no-overlap rule is checked on. */
export function labelRects(plan: ScenePlan): { kind: "plate" | "stack" | "count" | "room"; room: string; id: string; rect: Rect }[] {
  return plan.rooms.flatMap((r) => [
    ...r.placed.map((p) => ({ kind: "plate" as const, room: r.id, id: p.id, rect: p.plate })),
    ...(r.stack ? [{ kind: "stack" as const, room: r.id, id: r.id, rect: r.stack }] : []),
    ...(r.count ? [{ kind: "count" as const, room: r.id, id: r.id, rect: r.count.rect }] : []),
    ...(r.label ? [{ kind: "room" as const, room: r.id, id: r.id, rect: r.label }] : []),
  ]);
}
