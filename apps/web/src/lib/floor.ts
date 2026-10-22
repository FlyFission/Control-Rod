import type { OfficeItem, PackageView, Run } from "../api/types.js";
import type { StateKind } from "../components/StateMark.js";

export type RoomId = "general" | "site" | "doccontrol" | "verify" | "office" | "bench";

/** Floor plan in a 1000 x 600 space. People and agents stand inside these rooms. */
export const ROOMS: Record<RoomId, { label: string; x: number; y: number; w: number; h: number }> = {
  general: { label: "General desk", x: 20, y: 20, w: 300, h: 240 },
  site: { label: "Site and civil", x: 340, y: 20, w: 320, h: 240 },
  doccontrol: { label: "Document control", x: 680, y: 20, w: 300, h: 240 },
  verify: { label: "Verification bay", x: 20, y: 340, w: 340, h: 240 },
  office: { label: "Your office", x: 380, y: 340, w: 260, h: 240 },
  bench: { label: "Bench", x: 660, y: 340, w: 320, h: 240 },
};

export interface Figure {
  id: string;
  room: RoomId;
  x: number;
  y: number;
  state: StateKind;
  code: string;
  bubble: string;
  packageId: string;
}

const ROLE_SHORT: Record<Run["role"], string> = { intake: "INT", author: "AUT", "pre-check": "CHK" };

function roomFor(view: PackageView, run: Run): RoomId {
  if (run.status === "queued") return "bench";
  if (run.role === "pre-check") return "verify";
  if (run.role === "intake") return "general";
  const siteRole =
    view.package.agent_assignment.some((a) => a.role.startsWith("site")) || run.agent_baseline.startsWith("site");
  return siteRole || view.package.mode === "capital-projects" ? "site" : "general";
}

function slot(room: RoomId, i: number): { x: number; y: number } {
  const r = ROOMS[room];
  const cols = room === "office" ? 2 : 4;
  const cw = r.w / cols;
  const rowH = 70;
  const col = i % cols;
  const row = Math.floor(i / cols);
  return { x: r.x + cw * (col + 0.5), y: r.y + 115 + row * rowH };
}

/**
 * One figure per active run, plus one figure in your office for each item that needs you.
 * Four fit inside the office; the rest wait at the door.
 */
export function layoutFloor(views: PackageView[], office: OfficeItem[]): Figure[] {
  const counts: Record<RoomId, number> = { general: 0, site: 0, doccontrol: 0, verify: 0, office: 0, bench: 0 };
  const figures: Figure[] = [];
  for (const v of views) {
    for (const run of v.runs) {
      if (run.status !== "running" && run.status !== "queued") continue;
      const room = roomFor(v, run);
      const p = slot(room, counts[room]++);
      figures.push({
        id: `run:${run.id}`,
        room,
        ...p,
        state: run.status === "running" ? "working" : "idle",
        code: `${v.package.id} ${ROLE_SHORT[run.role]}`,
        bubble: run.label ?? (run.status === "running" ? "Working" : "Queued"),
        packageId: v.package.id,
      });
    }
  }
  office.forEach((o, i) => {
    const inside = i < 4;
    const p = inside ? slot("office", i) : { x: 510 - 40 + (i - 4) * 36, y: 318 };
    figures.push({
      id: `office:${o.kind}:${o.package_id}:${o.package_revision}`,
      room: "office",
      ...p,
      state: o.kind === "dispute" ? "stuck" : "needs",
      code: o.package_id,
      bubble: o.title,
      packageId: o.package_id,
    });
  });
  return figures;
}
