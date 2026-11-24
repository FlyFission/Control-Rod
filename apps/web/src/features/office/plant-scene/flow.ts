import { type PlaceId, ROOMS } from "./geometry.js";

/**
 * The stage pipeline (plan 6.2). Only occupancy is known, so a segment is a steady lit stripe, never
 * a pulse, and never a traversal: work bays to verification, verification to review, review and
 * verification to the control room, any room to the hold yard. A segment is lit while the room it
 * leads into holds a working figure and the room it leaves holds any figure; the segments into the
 * control room are amber, and only while something waits on the viewer. Nothing flows in a SCRAM.
 */
export interface Occupancy {
  count: number;
  working: number;
}
export type OccupancyMap = ReadonlyMap<string, Occupancy>;

export interface Segment {
  id: string;
  from: PlaceId;
  to: PlaceId;
  tone: "screen" | "needs-you";
}

const BAYS: PlaceId[] = ["process", "mechanical", "electrical", "civil", "assurance", "project-controls"];
const PIPES: ReadonlyArray<readonly [PlaceId, PlaceId]> = [
  ...BAYS.map((b) => [b, "verification"] as const),
  ["verification", "review"],
  ["review", "your-office"],
  ["verification", "your-office"],
  ...(["process", "mechanical", "electrical", "civil", "assurance", "project-controls", "review", "interface", "verification", "your-office", "document-control", "bench"] as PlaceId[]).map(
    (r) => [r, "quarantine"] as const,
  ),
];

export function flowSegments(occ: OccupancyMap, waiting: boolean, scram: boolean): Segment[] {
  if (scram) return [];
  const out: Segment[] = [];
  for (const [from, to] of PIPES) {
    const leaves = (occ.get(from)?.count ?? 0) > 0;
    if (!leaves) continue;
    if (to === "your-office") {
      if (waiting) out.push({ id: `${from}>${to}`, from, to, tone: "needs-you" });
    } else if ((occ.get(to)?.working ?? 0) > 0) {
      out.push({ id: `${from}>${to}`, from, to, tone: "screen" });
    }
  }
  return out;
}

/** The site ring the pipe runs follow, in canvas units (measured on base-dark: the middle of its double ring). */
const RING = { cx: 1200, cy: 860, rx: 1040, ry: 597 };

const angleOf = (p: PlaceId) => {
  const [x0, y0, x1, y1] = ROOMS[p].bbox;
  return Math.atan2(((y0 + y1) / 2 - RING.cy) / RING.ry, ((x0 + x1) / 2 - RING.cx) / RING.rx);
};

/** Points along the ring from one room's angle to the other's, the short way round. */
export function ringPath(from: PlaceId, to: PlaceId, steps = 28): string {
  const a = angleOf(from);
  let d = angleOf(to) - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = a + (d * i) / steps;
    pts.push(`${(RING.cx + RING.rx * Math.cos(t)).toFixed(1)},${(RING.cy + RING.ry * Math.sin(t)).toFixed(1)}`);
  }
  return pts.join(" ");
}
