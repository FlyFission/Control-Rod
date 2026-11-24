import { describe, expect, it } from "vitest";
import type { FigureState } from "../OfficeStage.js";
import { METRICS, type PlanFigure, type Rect, frameAt, intersects, labelRects, modeAt, planScene } from "./figure-layout.js";
import { CANVAS, ROOMS } from "./geometry.js";

const STATES: FigureState[] = ["working", "needs", "waiting", "stuck", "changed"];
const rooms = Object.keys(ROOMS);
const name = (r: string) => r.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** 40 agents: spread over every room, with one room holding eight and another five. */
const forty = (): PlanFigure[] => {
  const out: PlanFigure[] = [];
  const put = (room: string, n: number) => {
    for (let i = 0; i < n; i++) out.push({ id: `${room}-${i}`, region: room, state: STATES[out.length % STATES.length]! });
  };
  put("process", 8);
  put("review", 5);
  for (const r of rooms) if (out.length < 40 && !out.some((f) => f.region === r)) put(r, 2);
  put("mechanical", 40 - out.length);
  return out;
};

// 1440 px window: scene about 1176 wide. Others: a wide window, a large one, a tablet and a phone.
const SCALES = [1176, 1650, 2400, 800, 342].map((w) => w / CANVAS.width);

const box = (u: number, id: string): Rect => {
  const [x0, y0, x1, y1] = ROOMS[id as keyof typeof ROOMS].bbox;
  return { x: x0 * u, y: y0 * u, w: (x1 - x0) * u, h: (y1 - y0) * u };
};

/** Every rule the plan owes: each label is whole, clear of every other, of every room's painted box (its own count plate aside) and of every figure. */
function problems(figs: PlanFigure[], u: number): string[] {
  const plan = planScene({ figures: figs, u, name });
  const all = labelRects(plan);
  const bad: string[] = [];
  all.forEach((a, i) => {
    const key = `${a.kind}:${a.id}`;
    if (a.rect.x < 0 || a.rect.y < 0 || a.rect.x + a.rect.w > CANVAS.width * u || a.rect.y + a.rect.h > CANVAS.height * u) bad.push(`${key} leaves the picture`);
    all.slice(i + 1).forEach((b) => {
      if (intersects(a.rect, b.rect)) bad.push(`${key} overlaps ${b.kind}:${b.id}`);
    });
    for (const id of rooms) {
      const r = box(u, id);
      if (a.kind === "count") {
        if (a.room === id) {
          const inside = a.rect.x >= r.x && a.rect.y >= r.y && a.rect.x + a.rect.w <= r.x + r.w && a.rect.y + a.rect.h <= r.y + r.h;
          if (!inside) bad.push(`${key} crosses its tile's edge`);
        } else if (intersects(a.rect, r)) bad.push(`${key} enters the ${id} room`);
      } else if (intersects(a.rect, r)) {
        // A roster stands clear of every room, its own included.
        bad.push(`${key} touches the ${id} room`);
      }
    }
    // No label covers any standing figure.
    if (a.kind === "roster") for (const r of plan.rooms) for (const p of r.placed) if (intersects(a.rect, p.body)) bad.push(`${key} covers figure ${p.id}`);
  });
  return bad;
}

describe("plant scene layout", () => {
  it("draws no roster plate over another, a room or a figure, for 40 agents at every scale", () => {
    for (const u of SCALES) expect(problems(forty(), u), `u=${u}`).toEqual([]);
  });

  it("lists at most three rows per room plus a +N more, and stands as many figures as the room has seats, at every scale", () => {
    for (const n of [1, 3, 4, 6, 8, 12]) {
      for (const u of SCALES) {
        const figs: PlanFigure[] = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, region: "process", state: STATES[i % 5]! }));
        expect(problems(figs, u), `${n} figures, u=${u}`).toEqual([]);
        const room = planScene({ figures: figs, u, name }).rooms.find((r) => r.id === "process")!;
        expect(room.total).toBe(n);
        if (room.mode === "figures") {
          expect(room.rows.length).toBeLessThanOrEqual(3);
          expect(room.placed.length).toBe(Math.min(n, ROOMS.process.seats.length));
          // Everyone is accounted for: listed on a row, or behind "+N more".
          expect(room.rows.length + room.more).toBe(n);
        } else expect(room.placed).toEqual([]);
      }
    }
  });

  it("lists what most needs the viewer first", () => {
    const figs: PlanFigure[] = ["working", "working", "working", "needs", "stuck", "working"].map((state, i) => ({ id: `f${i}`, region: "process", state: state as FigureState }));
    const room = planScene({ figures: figs, u: 1176 / CANVAS.width, name }).rooms.find((r) => r.id === "process")!;
    expect(room.mode).toBe("figures");
    expect(room.rows[0]).toBe("f3");
    expect(room.rows[1]).toBe("f4");
    expect(room.placed.length).toBe(6);
    expect(room.more).toBe(6 - room.rows.length);
  });

  it("stands every figure and lists it, with no +N more, where they all fit", () => {
    const u = 2400 / CANVAS.width;
    const figs: PlanFigure[] = [{ id: "a", region: "process", state: "working" }];
    const room = planScene({ figures: figs, u, name }).rooms.find((r) => r.id === "process")!;
    expect(room.placed.map((p) => p.id)).toEqual(["a"]);
    expect(room.rows).toEqual(["a"]);
    expect(room.more).toBe(0);
  });

  it("counts agents that have no seat, and folded ones, in +N more", () => {
    const figs: PlanFigure[] = [{ id: "a", region: "review", state: "working" }];
    const room = planScene({ figures: figs, extra: [{ region: "review", state: "stuck" }], folded: new Map([["review", 2]]), u: 1176 / CANVAS.width, name }).rooms.find((r) => r.id === "review")!;
    expect(room.total).toBe(4);
    expect(room.rows.length + room.more).toBe(4);
    expect(room.more).toBeGreaterThanOrEqual(3);
  });

  it("sizes the crew from the scale: about 64 px at a 1440 window, bigger above, and count plates once figures would be under 42 px", () => {
    const at1440 = frameAt(1176 / CANVAS.width) * METRICS.crewFill;
    expect(at1440).toBeGreaterThan(58);
    expect(at1440).toBeLessThan(70);
    expect(frameAt(1800 / CANVAS.width)).toBeGreaterThan(frameAt(1176 / CANVAS.width));
    expect(modeAt(1176 / CANVAS.width)).toBe("figures");
    expect(modeAt(760 / CANVAS.width)).toBe("counts");
    expect(modeAt(342 / CANVAS.width)).toBe("counts");
    const plan = planScene({ figures: forty(), u: 342 / CANVAS.width, name });
    expect(plan.rooms.every((r) => r.placed.length === 0)).toBe(true);
    for (const r of plan.rooms.filter((x) => x.total > 0)) expect(r.count).toBeDefined();
  });

  it("counts every agent per state on a count plate, folded ones as working", () => {
    const figs: PlanFigure[] = [
      { id: "a", region: "process", state: "needs" },
      { id: "b", region: "process", state: "working" },
    ];
    const plan = planScene({ figures: figs, extra: [{ region: "process", state: "stuck" }], folded: new Map([["process", 3]]), u: 800 / CANVAS.width, name });
    const room = plan.rooms.find((r) => r.id === "process")!;
    expect(room.byState).toEqual([["needs", 1], ["stuck", 1], ["working", 4]]);
    expect(room.total).toBe(6);
  });

  it("takes its rooms from the geometry: every room is planned, and an unknown room's figure is ignored", () => {
    const plan = planScene({ figures: [{ id: "x", region: "no-such-room", state: "working" }], u: 0.49, name });
    expect(plan.rooms.map((r) => r.id)).toEqual(rooms);
    expect(plan.rooms.every((r) => r.total === 0)).toBe(true);
  });

  it("names every room at 1440 and leaves a name off rather than overlap at any scale", () => {
    for (const u of SCALES) expect(problems([], u), `u=${u}`).toEqual([]);
    expect(planScene({ figures: [], u: 1176 / CANVAS.width, name }).rooms.every((r) => r.roster)).toBe(true);
    // A roster that cannot be placed at the busiest scale leaves the room a count plate, never a plate on top of something.
    for (const u of SCALES) for (const r of planScene({ figures: forty(), u, name }).rooms) if (r.total > 0) expect(Boolean(r.roster) || Boolean(r.count)).toBe(true);
  });
});
