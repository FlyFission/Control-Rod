import type { FigureState } from "../OfficeStage.js";
import { CANVAS, CORE_BBOX, CREW_BASELINE, CREW_FRAME, ROOMS } from "./geometry.js";

/**
 * Where everything the Plant writes on the picture goes, worked out from the room geometry and the
 * scene's scale, with no constants tied to a window width and no list of rooms. The painted crew and
 * the text over it are sized differently on purpose: the crew scales with the picture (so a bigger
 * window draws bigger figures), the text does not (it stays at its token size), so what fits is a
 * question of the scale, answered here:
 *
 *  - Wide enough for a figure to read (about 42 px or more): each room's figures stand on its tile's
 *    seats in order of need, as many as it has seats. The room has ONE roster plate, just outside it:
 *    the room's name, up to three rows (badge, short title, state chip) and "+N more" for the rest.
 *    The plate takes the nearest clear spot (below, beside or above); if it cannot be given room at
 *    its full height it gives up rows, and a room that cannot hold even a header falls back to a
 *    count plate on its tile. Nothing overlaps.
 *  - Narrower: figures are not drawn at all; each room shows one count plate (by state) on its tile,
 *    and as many room names as have clear room.
 *
 * All sizes below are screen px, positions are px from the canvas's top left. The same function
 * runs in the app and in its unit test, so "no label overlaps another, a room or a figure" is
 * checked on exactly what is drawn. Rooms come from the geometry, however many it holds.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Label sizes in px (the fonts are the --fs-* tokens; these are the boxes they are set in). */
export const METRICS = {
  /** A roster plate: its width with rows, its header, a row, the "+N more" line and the padding. */
  roster: { w: 188, compactW: 156, headW: 140, head: 22, row: 20, more: 20, pad: 6, maxRows: 3 },
  countW: 92,
  countRow: 16,
  countPad: 6,
  micro: { w: 32, h: 20 },
  /** An average glyph at the label size, plus the plate's padding and border, for a name's width. */
  labelChar: 7.5,
  labelPad: 22,
  /** The least gap between two labels, and the least between a label and the edge of the canvas. */
  gap: 3,
  margin: 3,
  /** The reactor plate (name and captions), kept clear by the rosters. */
  reactor: { w: 190, h: 100 },
  /** A crew frame in canvas units, and how much of the frame the figure fills (top of head to feet). */
  crewFrame: 140,
  crewFill: 0.92,
  crewMax: 104,
  /** Below this a figure is too small to read: the scene switches to count plates. */
  lodFigure: 42,
  /** The figure's width as a share of its frame (its focus box). */
  bodyShare: 0.5,
} as const;

/** What most needs the viewer comes first, so the figures that are listed are the urgent ones. */
export const PRIORITY: readonly FigureState[] = ["needs", "stuck", "changed", "waiting", "working"];

export interface PlanFigure {
  id: string;
  region: string;
  state: FigureState;
}

export interface PlanInput {
  figures: readonly PlanFigure[];
  /** Agents on the floor that are not in `figures` (over a room's seats); counted in its "+N more". */
  extra?: readonly { region: string; state: FigureState }[];
  /** Healthy agents folded into counts, per room: only a count plate and "+N more" show them. */
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
  /** The figure's standing body: its focus box, and what plates keep clear of. */
  body: Rect;
  /** The crew frame (the painted image), square, standing its baseline on the seat's feet point. */
  frame: Rect;
  /** Which side of the figure its full-name tooltip opens, away from the picture's nearest edge. */
  tip: "above" | "below";
  /** How the tooltip lines up with the button, so it stays inside the picture at the left and right edges. */
  align: "start" | "center" | "end";
}

export type RoomMode = "figures" | "count" | "empty";

export interface RoomPlan {
  id: string;
  name: string;
  /** What the tile paints, in px. */
  box: Rect;
  /** Everyone in the room, drawn or not. */
  total: number;
  byState: [FigureState, number][];
  mode: RoomMode;
  /** Figures standing on seats: as many as the room has seats, or fewer. */
  placed: Placed[];
  /** The figures listed on the roster plate, in order of need (at most three). */
  rows: string[];
  /** How many the roster's "+N more" stands for: everyone not listed. Zero when the roster lists everyone. */
  more: number;
  /** The roster plate, or the bare room name for an empty room; absent when it has nowhere clear to go. */
  roster?: Rect;
  count?: { rect: Rect; tier: "full" | "micro" };
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

/** One room's painted box in px, from the geometry. */
export const roomBox = (id: string, u: number): Rect => {
  const [x0, y0, x1, y1] = ROOMS[id as keyof typeof ROOMS].bbox;
  return { x: x0 * u, y: y0 * u, w: (x1 - x0) * u, h: (y1 - y0) * u };
};

/** The crew frame's side in px at this scale. */
export const frameAt = (u: number) => Math.min(METRICS.crewMax, METRICS.crewFrame * u);

/** Figures or counts: figures only where one reads. */
export function modeAt(u: number): "figures" | "counts" {
  return frameAt(u) * METRICS.crewFill >= METRICS.lodFigure ? "figures" : "counts";
}

export function labelWidth(text: string): number {
  return Math.ceil(text.length * METRICS.labelChar + METRICS.labelPad);
}

/** A roster plate's size for this many listed rows, with a "+N more" line or not. */
export function rosterSize(name: string, rows: number, more: boolean, compact = false): { w: number; h: number } {
  const m = METRICS.roster;
  if (rows === 0 && !more) return { w: labelWidth(name), h: METRICS.micro.h };
  const w = rows > 0 ? (compact ? m.compactW : m.w) : Math.max(labelWidth(name) + 28, m.headW);
  return { w, h: m.head + rows * m.row + (more ? m.more : 0) + m.pad };
}

const urgency = (r: { byState: [FigureState, number][] }) => (r.byState.length ? PRIORITY.indexOf(r.byState[0]![0]) : PRIORITY.length);

export function planScene(input: PlanInput): ScenePlan {
  const { u } = input;
  const mode = modeAt(u);
  const frame = mode === "figures" ? frameAt(u) : 0;
  const canvas: Rect = { x: 0, y: 0, w: CANVAS.width * u, h: CANVAS.height * u };
  const ids = Object.keys(ROOMS);

  const rooms: RoomPlan[] = ids.map((id) => {
    const box = roomBox(id, u);
    const mine = input.figures.filter((f) => f.region === id).sort((a, b) => PRIORITY.indexOf(a.state) - PRIORITY.indexOf(b.state));
    const extra = (input.extra ?? []).filter((f) => f.region === id);
    const folded = input.folded?.get(id) ?? 0;
    const counts = new Map<FigureState, number>();
    for (const f of [...mine, ...extra]) counts.set(f.state, (counts.get(f.state) ?? 0) + 1);
    if (folded > 0) counts.set("working", (counts.get("working") ?? 0) + folded);
    const byState = PRIORITY.filter((s) => counts.has(s)).map((s) => [s, counts.get(s)!] as [FigureState, number]);
    const total = byState.reduce((n, [, c]) => n + c, 0);
    const plan: RoomPlan = { id, name: input.name(id), box, total, byState, mode: total === 0 ? "empty" : mode === "counts" ? "count" : "figures", placed: [], rows: [], more: 0 };
    if (plan.mode === "figures") {
      const seats = ROOMS[id as keyof typeof ROOMS].seats.map((s) => ({ x: s.x * u, y: s.y * u }));
      plan.placed = mine.slice(0, seats.length).map((f, i) => stand(f, seats[i]!, frame, canvas));
    }
    return plan;
  });

  // Obstacles every plate keeps clear of: each room's painted box, each standing figure, the reactor plate.
  const core = { x: CORE_BBOX[0] * u, y: CORE_BBOX[1] * u, w: (CORE_BBOX[2] - CORE_BBOX[0]) * u, h: (CORE_BBOX[3] - CORE_BBOX[1]) * u };
  const reactor: Rect = { x: core.x + (core.w - METRICS.reactor.w) / 2, y: core.y + core.h * 0.94 - METRICS.reactor.h, w: METRICS.reactor.w, h: METRICS.reactor.h };
  const fixed: Rect[] = [reactor, ...rooms.map((r) => r.box)];
  const bodies = new Map(rooms.map((r) => [r.id, r.placed.map((p) => p.body)]));
  const taken: Rect[] = [];
  const clear = (r: Rect) => within(r, canvas, 1) && fixed.every((o) => !intersects(r, o, 1)) && [...bodies.values()].every((bs) => bs.every((b) => !intersects(r, b))) && taken.every((t) => !intersects(r, t, METRICS.gap));

  // Count plates sit on their tile, so they are placed first and then count as taken.
  for (const r of rooms) {
    if (r.mode !== "count") continue;
    r.count = countPlate(r.box, r.byState, ROOMS[r.id as keyof typeof ROOMS].seats.map((s) => ({ x: s.x * u, y: s.y * u })));
    taken.push(r.count.rect);
  }

  // Rosters: the rooms that most need the viewer choose first.
  const order = [...rooms].sort((a, b) => urgency(a) - urgency(b) || b.total - a.total);
  for (const r of order) {
    if (r.mode === "empty" || r.mode === "count") {
      // A name alone: placed if a clear spot exists, left off otherwise (the room keeps its accessible name).
      const { w, h } = rosterSize(r.name, 0, false);
      const spot = pickSpot(r.box, w, h, core, clear);
      if (spot) {
        r.roster = spot;
        taken.push(spot);
      }
      continue;
    }
    const listed = r.placed.map((p) => p.id);
    for (let n = Math.min(METRICS.roster.maxRows, listed.length); n >= 0; n--) {
      const more = r.total - n;
      // The full width first, then a narrower plate before giving a row up.
      let spot: Rect | undefined;
      for (const compact of n > 0 ? [false, true] : [false]) {
        const { w, h } = rosterSize(r.name, n, more > 0, compact);
        spot = pickSpot(r.box, w, h, core, clear);
        if (spot) break;
      }
      if (!spot) continue;
      r.roster = spot;
      r.rows = listed.slice(0, n);
      r.more = more;
      taken.push(spot);
      break;
    }
    if (!r.roster) {
      // Not even a header fits: the room falls back to a count plate on its tile, its figures not drawn.
      r.mode = "count";
      r.placed = [];
      bodies.set(r.id, []);
      r.count = countPlate(r.box, r.byState, ROOMS[r.id as keyof typeof ROOMS].seats.map((s) => ({ x: s.x * u, y: s.y * u })));
      taken.push(r.count.rect);
    }
  }
  return { u, mode, frame, rooms };
}

function stand(f: PlanFigure, seat: { x: number; y: number }, frame: number, canvas: Rect): Placed {
  const bw = frame * METRICS.bodyShare;
  const bh = frame * METRICS.crewFill;
  const body: Rect = { x: seat.x - bw / 2, y: seat.y - bh, w: bw, h: bh };
  const top = frame * (CREW_BASELINE / CREW_FRAME);
  const img: Rect = { x: seat.x - frame / 2, y: seat.y - top, w: frame, h: frame };
  return { id: f.id, state: f.state, seat, body, frame: img, tip: seat.y < canvas.h / 2 ? "below" : "above", align: seat.x < 130 ? "start" : seat.x > canvas.w - 130 ? "end" : "center" };
}

/** The cheapest clear spot for a w x h plate beside a room: close to it, below first, off the containment if it can be. */
function pickSpot(box: Rect, w: number, h: number, core: Rect, clear: (r: Rect) => boolean): Rect | undefined {
  const g = METRICS.margin;
  const cands: { rect: Rect; cost: number }[] = [];
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const over = (r: Rect) => {
    // Does the plate cover the containment's ellipse? Its nearest point to the ellipse's centre decides.
    const ex = core.x + core.w / 2;
    const ey = core.y + core.h / 2;
    const nx = Math.min(Math.max(ex, r.x), r.x + r.w);
    const ny = Math.min(Math.max(ey, r.y), r.y + r.h);
    return ((nx - ex) / (core.w / 2)) ** 2 + ((ny - ey) / (core.h / 2)) ** 2 < 1;
  };
  const add = (rect: Rect, side: number, ring: number, along: number) => {
    cands.push({ rect, cost: ring * 40 + side + along * 0.15 });
  };
  for (const [ring, gap] of [g, g + 14, g + 40].entries()) {
    for (let i = 0; i < 9; i++) {
      const x = box.x - w * 0.75 + ((box.w + w * 0.5) * i) / 8;
      const along = Math.abs(x + w / 2 - cx);
      add({ x, y: box.y + box.h + gap, w, h }, 0, ring, along);
      add({ x, y: box.y - gap - h, w, h }, 25, ring, along);
    }
    for (let i = 0; i < 7; i++) {
      const y = box.y - h * 0.5 + ((box.h + h * 0.0) * i) / 6;
      const along = Math.abs(y + h / 2 - cy);
      add({ x: box.x + box.w + gap, y, w, h }, 10, ring, along);
      add({ x: box.x - gap - w, y, w, h }, 10, ring, along);
    }
  }
  const ok = cands.filter((c) => clear(c.rect));
  if (!ok.length) return undefined;
  const best = (list: typeof ok) => list.reduce((a, b) => (b.cost < a.cost ? b : a));
  const off = ok.filter((c) => !over(c.rect));
  return best(off.length ? off : ok).rect;
}

function countPlate(box: Rect, rows: readonly [FigureState, number][], seats: readonly { x: number; y: number }[]): { rect: Rect; tier: "full" | "micro" } {
  const full = { w: METRICS.countW, h: rows.length * METRICS.countRow + METRICS.countPad };
  const small = METRICS.micro;
  // On the tile's floor: the middle of its seats, nudged inside the painted box.
  const mx = seats.length ? seats.reduce((s, p) => s + p.x, 0) / seats.length : box.x + box.w / 2;
  const my = seats.length ? seats.reduce((s, p) => s + p.y, 0) / seats.length : box.y + box.h / 2;
  const put = (s: { w: number; h: number }): Rect => ({
    x: Math.min(Math.max(mx - s.w / 2, box.x + METRICS.margin), Math.max(box.x + METRICS.margin, box.x + box.w - METRICS.margin - s.w)),
    y: Math.min(Math.max(my - s.h / 2, box.y + METRICS.margin), Math.max(box.y + METRICS.margin, box.y + box.h - METRICS.margin - s.h)),
    w: s.w,
    h: s.h,
  });
  const rect = put(full);
  if (within(rect, box, METRICS.margin)) return { rect, tier: "full" };
  return { rect: put(small), tier: "micro" };
}

/** Every label the plan draws, with its kind: what the no-overlap rule is checked on. */
export function labelRects(plan: ScenePlan): { kind: "roster" | "count"; room: string; id: string; rect: Rect }[] {
  return plan.rooms.flatMap((r) => [
    ...(r.roster ? [{ kind: "roster" as const, room: r.id, id: r.id, rect: r.roster }] : []),
    ...(r.count ? [{ kind: "count" as const, room: r.id, id: r.id, rect: r.count.rect }] : []),
  ]);
}
