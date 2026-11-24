import type { FigureState } from "../OfficeStage.js";
import { CANVAS, CORE_BBOX, ROOMS, SPRITE, SPRITE_ANCHOR, SPRITE_BOX } from "./geometry.js";

/**
 * Where everything the Plant writes on the picture goes, worked out from the room geometry and the
 * scene's scale, with no constants tied to a window width and no list of rooms. The painted crew and
 * the text over it are sized differently on purpose: the crew scales with the picture (so a bigger
 * window draws bigger figures), the text does not (it stays at its token size), so what fits is a
 * question of the scale, answered here:
 *
 *  - Wide enough for a figure to read (about 23 px or more): each room's figures stand on its tile's
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

const FIGURE_SCALE = 1.5;

/** Label sizes in px (the fonts are the --fs-* tokens; these are the boxes they are set in). */
export const METRICS = {
  /** A roster plate: its width with rows, its header, a row, the "+N more" line and the padding. */
  roster: { w: 272, compactW: 204, head: 22, row: 20, more: 20, pad: 6, maxRows: 3 },
  /** A collapsed roster: one line, the room's name and a shape+number per state. */
  collapsed: { h: 22, perState: 30, pad: 8 },
  /** A name+count tag on a tile, for a room that has no clear spot for a roster. */
  tag: { h: 20, minW: 56 },
  /** How far the containment's ellipse is grown, in px, before a plate may stand beside it. */
  coreGap: 4,
  /** A roster further than this from its tile gets a leader line. */
  leaderFrom: 20,
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
  /**
   * A worker sprite's frame in canvas units: the sprite cell at the render's own scale (cell / px per plate px)
   * times a magnification that keeps a seated worker readable at a 1440 px window; and how much of the frame
   * a seated figure fills, which sets when figures give way to counts.
   */
  figureScale: FIGURE_SCALE,
  crewFrame: (SPRITE.cell / SPRITE.pxPerPlatePx) * FIGURE_SCALE,
  crewFill: 0.5,
  /** The least a figure's focus box may be (px): a pointer target. */
  minTarget: 24,
  crewMax: 104,
  /** Below this a figure is too small to read: the scene switches to count plates. */
  lodFigure: 23,
} as const;

/** What most needs the viewer comes first, so the figures that are listed are the urgent ones. */
export const PRIORITY: readonly FigureState[] = ["needs", "stuck", "changed", "waiting", "working"];

/** The sprite a state draws: an input that changed shows the waiting pose (its chip says Changed). */
export const POSE: Record<FigureState, "working" | "waiting" | "stuck" | "needs-you"> = {
  working: "working",
  waiting: "waiting",
  stuck: "stuck",
  needs: "needs-you",
  changed: "waiting",
};

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
  /** The sprite's frame (the painted image), square, placed so its anchor pixel is on the seat's feet point. */
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
  /** The roster plate as first drawn (collapsed, or expanded for a room that needs the viewer); absent when it has nowhere clear to go. */
  roster?: Rect;
  /** True when the plate starts expanded: the room holds a needs-you or stuck figure. */
  expanded: boolean;
  /** Rows are drawn in the narrower plate (the chip is its shape alone). */
  compact: boolean;
  /** The plate while the room, a figure or the plate is hovered or focused: it may overlay (it has a solid ground). */
  open?: Rect;
  /** A compact name+count tag on the tile, for a room with no clear spot for a roster. */
  tag?: Rect;
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

/** An expanded roster plate's size for this many listed rows, with a "+N more" line or not. */
export function rosterSize(rows: number, more: boolean, compact = false): { w: number; h: number } {
  const m = METRICS.roster;
  return { w: compact ? m.compactW : m.w, h: m.head + rows * m.row + (more ? m.more : 0) + m.pad };
}

/** A collapsed roster's size: the name and one shape+number per state, on one line. */
export function collapsedSize(name: string, states: number): { w: number; h: number } {
  const m = METRICS.collapsed;
  return { w: labelWidth(name) + (states ? states * m.perState + m.pad : 0), h: m.h };
}

/** Does a plate cover the containment? Its nearest point to the ellipse inscribed in the core's box decides. */
export function overCore(r: Rect, core: Rect, grow: number = METRICS.coreGap): boolean {
  const ex = core.x + core.w / 2;
  const ey = core.y + core.h / 2;
  const nx = Math.min(Math.max(ex, r.x), r.x + r.w);
  const ny = Math.min(Math.max(ey, r.y), r.y + r.h);
  return ((nx - ex) / (core.w / 2 + grow)) ** 2 + ((ny - ey) / (core.h / 2 + grow)) ** 2 < 1;
}

/** The leader line from a plate to its tile, or none when the plate stands by the tile. Canvas px. */
export function leaderBetween(plate: Rect, tile: Rect): { x1: number; y1: number; x2: number; y2: number } | undefined {
  const cx = plate.x + plate.w / 2;
  const cy = plate.y + plate.h / 2;
  const x2 = Math.min(Math.max(cx, tile.x), tile.x + tile.w);
  const y2 = Math.min(Math.max(cy, tile.y), tile.y + tile.h);
  const x1 = Math.min(Math.max(x2, plate.x), plate.x + plate.w);
  const y1 = Math.min(Math.max(y2, plate.y), plate.y + plate.h);
  return Math.hypot(x1 - x2, y1 - y2) > METRICS.leaderFrom ? { x1, y1, x2, y2 } : undefined;
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
    const plan: RoomPlan = { id, name: input.name(id), box, total, byState, mode: total === 0 ? "empty" : mode === "counts" ? "count" : "figures", placed: [], rows: [], more: 0, expanded: false, compact: false };
    if (plan.mode === "figures") {
      const seats = ROOMS[id as keyof typeof ROOMS].seats.map((s) => ({ x: s.x * u, y: s.y * u }));
      plan.placed = mine.slice(0, seats.length).map((f, i) => stand(f, id, seats[i]!, frame, canvas));
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

  // Rosters: the rooms that most need the viewer choose first, and at their expanded size.
  const order = [...rooms].sort((a, b) => urgency(a) - urgency(b) || b.total - a.total);
  const seatsOf = (r: RoomPlan) => ROOMS[r.id as keyof typeof ROOMS].seats.map((s) => ({ x: s.x * u, y: s.y * u }));
  const labelFree = (r: Rect) => within(r, canvas, 1) && fixed.every((o) => !intersects(r, o, 1)) && [...bodies.values()].every((bs) => bs.every((b) => !intersects(r, b)));
  for (const r of order) {
    const attention = r.byState.some(([s]) => s === "needs" || s === "stuck");
    const spotFor = (w: number, h: number) => pickSpot(r.box, w, h, core, clear);
    if (r.mode === "figures") {
      const listed = r.placed.map((p) => p.id);
      const top = Math.min(METRICS.roster.maxRows, listed.length);
      r.rows = listed.slice(0, top);
      r.more = r.total - top;
      if (attention) {
        for (let n = top; n >= 1 && !r.roster; n--) {
          for (const compact of [false, true]) {
            const sz = rosterSize(n, r.total - n > 0, compact);
            const spot = spotFor(sz.w, sz.h);
            if (!spot) continue;
            r.roster = spot;
            r.rows = listed.slice(0, n);
            r.more = r.total - n;
            r.compact = compact;
            r.expanded = true;
            break;
          }
        }
      }
    }
    if (!r.roster) {
      // Collapsed: the name and its per-state counts on one line (the name alone for an empty room).
      const sz = collapsedSize(r.name, r.mode === "empty" || r.mode === "count" ? 0 : r.byState.length);
      const spot = spotFor(sz.w, sz.h);
      if (spot) r.roster = spot;
    }
    if (r.roster) {
      taken.push(r.roster);
      if (r.mode === "figures") {
        const sz = rosterSize(r.rows.length, r.more > 0, r.compact);
        r.open = r.expanded ? r.roster : expandAt(r.roster, sz, core, canvas, labelFree);
      }
      continue;
    }
    // No clear spot for even the collapsed plate: a compact name+count tag on the tile, so the room is still named.
    const mine = bodies.get(r.id) ?? [];
    const tagW = Math.min(labelWidth(r.name) + (r.total ? 22 : 0), r.box.w - 2 * METRICS.margin);
    let tag = tagSpot(r.box, tagW, [...mine, ...taken.filter((t) => intersects(t, r.box))]);
    if (!tag && r.mode === "figures") {
      // The figures leave the tile to the tag: the room becomes a count plate and a tag.
      r.mode = "count";
      r.placed = [];
      r.rows = [];
      r.more = 0;
      bodies.set(r.id, []);
      r.count = countPlate(r.box, r.byState, seatsOf(r));
      taken.push(r.count.rect);
      tag = tagSpot(r.box, tagW, [r.count.rect]);
    }
    if (tag) {
      r.tag = tag;
      taken.push(tag);
    }
  }
  return { u, mode, frame, rooms };
}

function stand(f: PlanFigure, room: string, seat: { x: number; y: number }, frame: number, canvas: Rect): Placed {
  const key = `${ROOMS[room as keyof typeof ROOMS].garb}-${POSE[f.state]}` as keyof typeof SPRITE_ANCHOR;
  const k = frame / SPRITE.cell;
  const [ax, ay] = SPRITE_ANCHOR[key];
  const img: Rect = { x: seat.x - ax * k, y: seat.y - ay * k, w: frame, h: frame };
  // The focus box is what the sprite paints, grown to a pointer target about its centre.
  const [bx0, by0, bx1, by1] = SPRITE_BOX[key];
  const w = Math.max(METRICS.minTarget, (bx1 - bx0) * k);
  const h = Math.max(METRICS.minTarget, (by1 - by0) * k);
  const body: Rect = { x: img.x + ((bx0 + bx1) / 2) * k - w / 2, y: img.y + ((by0 + by1) / 2) * k - h / 2, w, h };
  return { id: f.id, state: f.state, seat, body, frame: img, tip: seat.y < canvas.h / 2 ? "below" : "above", align: seat.x < 130 ? "start" : seat.x > canvas.w - 130 ? "end" : "center" };
}

/** Where a plate opens to its expanded size from its collapsed spot: the first corner that keeps it clear of the containment and the tiles. It may overlay other plates. */
function expandAt(from: Rect, sz: { w: number; h: number }, core: Rect, canvas: Rect, free: (r: Rect) => boolean): Rect {
  const corners: [number, number][] = [
    [from.x, from.y],
    [from.x + from.w - sz.w, from.y],
    [from.x, from.y + from.h - sz.h],
    [from.x + from.w - sz.w, from.y + from.h - sz.h],
  ];
  const fit = (x: number, y: number): Rect => ({ x: Math.min(Math.max(x, 1), Math.max(1, canvas.w - sz.w - 1)), y: Math.min(Math.max(y, 1), Math.max(1, canvas.h - sz.h - 1)), w: sz.w, h: sz.h });
  const rects = corners.map(([x, y]) => fit(x, y));
  return rects.find((r) => free(r) && !overCore(r, core)) ?? rects.find((r) => !overCore(r, core)) ?? rects[0]!;
}

/** A spot for a name+count tag inside a tile's painted box, clear of what stands there. */
function tagSpot(box: Rect, w: number, avoid: Rect[]): Rect | undefined {
  const m = METRICS.margin;
  const h = METRICS.tag.h;
  if (w < METRICS.tag.minW) return undefined;
  const xs = [box.x + (box.w - w) / 2, box.x + m, box.x + box.w - m - w];
  const ys = [box.y + m, box.y + box.h - m - h, box.y + (box.h - h) / 2];
  for (const y of ys) for (const x of xs) {
    const r = { x, y, w, h };
    if (within(r, box, 0) && avoid.every((a) => !intersects(r, a))) return r;
  }
  return undefined;
}

/**
 * The cheapest clear spot for a w x h plate for a room. The containment is never covered. A plate stands on the room's
 * OUTWARD side (away from the plant's centre) first, then the other sides, near the tile first and then further off
 * (the caller draws a leader line when it is further than the tile's reach).
 */
function pickSpot(box: Rect, w: number, h: number, core: Rect, clear: (r: Rect) => boolean): Rect | undefined {
  const g = METRICS.margin;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // Outward: which way this room lies from the containment's centre.
  const ex = (cx - (core.x + core.w / 2)) / (core.w / 2);
  const ey = (cy - (core.y + core.h / 2)) / (core.h / 2);
  type Side = "above" | "below" | "left" | "right";
  const hSide: Side = ex >= 0 ? "right" : "left";
  const vSide: Side = ey >= 0 ? "below" : "above";
  const primary: Side = Math.abs(ex) > Math.abs(ey) ? hSide : vSide;
  const secondary: Side = primary === hSide ? vSide : hSide;
  const opposite: Record<Side, Side> = { above: "below", below: "above", left: "right", right: "left" };
  const sideCost = (s: Side) => (s === primary ? 0 : s === secondary ? 15 : s === opposite[secondary] ? 30 : 50);
  const cands: { rect: Rect; cost: number }[] = [];
  const add = (rect: Rect, side: Side, ring: number, along: number) => cands.push({ rect, cost: ring * 35 + sideCost(side) + along * 0.15 });
  const N = 13;
  for (const [ring, gap] of [g, g + 14, g + 42, g + 90, g + 150].entries()) {
    for (let i = 0; i < N; i++) {
      const x = box.x - w * 0.9 + ((box.w + w * 0.8) * i) / (N - 1);
      const along = Math.abs(x + w / 2 - cx);
      add({ x, y: box.y + box.h + gap, w, h }, "below", ring, along);
      add({ x, y: box.y - gap - h, w, h }, "above", ring, along);
      const y = box.y - h * 0.9 + ((box.h + h * 0.8) * i) / (N - 1);
      const alongY = Math.abs(y + h / 2 - cy);
      add({ x: box.x + box.w + gap, y, w, h }, "right", ring, alongY);
      add({ x: box.x - gap - w, y, w, h }, "left", ring, alongY);
    }
  }
  const ok = cands.filter((c) => !overCore(c.rect, core) && clear(c.rect));
  if (!ok.length) return undefined;
  return ok.reduce((a, b) => (b.cost < a.cost ? b : a)).rect;
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
export function labelRects(plan: ScenePlan): { kind: "roster" | "count" | "tag"; room: string; id: string; rect: Rect }[] {
  return plan.rooms.flatMap((r) => [
    ...(r.roster ? [{ kind: "roster" as const, room: r.id, id: r.id, rect: r.roster }] : []),
    ...(r.count ? [{ kind: "count" as const, room: r.id, id: r.id, rect: r.count.rect }] : []),
    ...(r.tag ? [{ kind: "tag" as const, room: r.id, id: r.id, rect: r.tag }] : []),
  ]);
}
