import type { AgentFigure } from "../../api/types.js";
import type { StageFigure } from "./OfficeStage.js";
import { type Point, REGION, type RegionId } from "./layout.js";

/**
 * Seats projected figures in the canonical layout (plan task 4.5): each figure in its place, the
 * longest waiting first, seats before queue places (Your office queues at its door, OV-01). Figures a
 * place cannot hold are returned as overflow, never drawn on top of each other; the view lists them.
 */
export function seatFigures(figures: readonly AgentFigure[], tint: (f: AgentFigure) => string, lens?: { label: string; value: (f: AgentFigure) => string }): { seated: StageFigure[]; overflow: AgentFigure[] } {
  const byPlace = new Map<RegionId, AgentFigure[]>();
  for (const f of figures) byPlace.set(f.place, [...(byPlace.get(f.place) ?? []), f]);
  const seated: StageFigure[] = [];
  const overflow: AgentFigure[] = [];
  for (const [place, list] of byPlace) {
    const region = REGION[place];
    const points: readonly Point[] = [...region.seats, ...region.queue];
    const ordered = [...list].sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.package_id.localeCompare(b.package_id));
    ordered.forEach((f, i) => {
      const at = points[i];
      if (!at) {
        overflow.push(f);
        return;
      }
      seated.push({ id: f.id, code: shortCode(f.package_id), state: f.state, cause: f.cause, region: place, at, body: bodyIndex(f.id), tint: tint(f), name: f.package_id,
        marks: { gate: f.marks.gate, changed: Boolean(f.marks.changed_input), ...(f.marks.loop ? { loop: f.marks.loop } : {}), safety: f.marks.safety },
        ...(lens ? { lensNote: `${lens.label} lens: ${lens.value(f)}` } : {}) });
    });
  }
  return { seated, overflow };
}

/**
 * A package code short enough for a figure's code plate at minimum zoom (six characters, the width
 * the quality harness measures); the full id is in its accessible name and card.
 */
export function shortCode(id: string): string {
  return id.length <= 6 ? id : `…${id.slice(-5)}`;
}

/** A stable body style per agent, so a figure keeps its look as it moves. */
function bodyIndex(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}
