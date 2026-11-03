import type { FigureState, StageFigure } from "./OfficeStage.js";
import { CUBE_SETS, type Point, REGION, type RegionId } from "./layout.js";

/**
 * Deterministic figures for the quality harness (plan task 4.3): n agents spread over the five states
 * and seated by where each state belongs, filling seats before queue places. They stand in for the
 * AgentFigure projection (4.6), which replaces them on the real floor.
 */

const HOME: Record<FigureState, readonly RegionId[]> = {
  working: CUBE_SETS,
  needs: ["your-office"],
  waiting: ["interface", "bench"],
  stuck: ["review", "document-control", "quarantine"],
  changed: ["verification", "bench"],
};

const CAUSES: Record<FigureState, string> = {
  working: "Drafting the line sizing calculation",
  needs: "Your signature on revision 2",
  waiting: "Waiting on Dana Ortiz for vendor data",
  stuck: "Missing the pump curve for 2 days",
  changed: "The design basis changed to revision C",
};

const ORDER: readonly FigureState[] = ["working", "needs", "waiting", "stuck", "changed", "working", "working", "needs"];

export function harnessFigures(n: number): StageFigure[] {
  const used = new Set<string>();
  const out: StageFigure[] = [];
  for (let i = 0; i < n; i++) {
    const state = ORDER[i % ORDER.length]!;
    const at = place(HOME[state], used) ?? place(CUBE_SETS, used);
    if (!at) throw new Error(`the office has no place for figure ${i + 1}`);
    out.push({ id: `f${i + 1}`, code: `P-${101 + i}`, state, cause: CAUSES[state], region: at.region, at: at.point, body: i });
  }
  return out;
}

function place(regions: readonly RegionId[], used: Set<string>): { region: RegionId; point: Point } | undefined {
  for (const id of regions) {
    const r = REGION[id];
    for (const p of [...r.seats, ...r.queue]) {
      const key = `${p.x},${p.y}`;
      if (!used.has(key)) {
        used.add(key);
        return { region: id, point: p };
      }
    }
  }
  return undefined;
}
