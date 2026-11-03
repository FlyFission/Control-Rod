import type { AgentFigure } from "../../api/types.js";
import type { RegionId } from "./layout.js";

/**
 * The exceptions overlay and portfolio rollup (plan task 4.11; OV-26). Past about forty agents the
 * floor stops drawing healthy work: working agents with no changed input and no gate waiting fold
 * into per room counts, so every agent that needs attention still stands out. Nothing is hidden: the
 * counts are shown, and the viewer may show everyone.
 */

/** Past this many agents the floor becomes an exceptions overlay. */
export const EXCEPTIONS_AT = 40;

/** Healthy work: an agent working, with no input changed under it and no gate decision waiting. */
export const isHealthy = (f: AgentFigure) => f.state === "working" && !f.marks.changed_input && !f.marks.gate;

export interface ExceptionsView {
  /** Whether the floor is folding healthy work now. */
  active: boolean;
  /** The figures to draw. */
  shown: AgentFigure[];
  /** Healthy agents folded, per room or cube set, in floor order. */
  folded: { place: RegionId; count: number }[];
}

export function exceptionsView(figures: readonly AgentFigure[], showEveryone: boolean): ExceptionsView {
  if (figures.length <= EXCEPTIONS_AT || showEveryone) return { active: false, shown: [...figures], folded: [] };
  const counts = new Map<RegionId, number>();
  const shown: AgentFigure[] = [];
  for (const f of figures) {
    if (isHealthy(f)) counts.set(f.place, (counts.get(f.place) ?? 0) + 1);
    else shown.push(f);
  }
  return { active: true, shown, folded: [...counts].map(([place, count]) => ({ place, count })) };
}

export interface ProjectRollup {
  project: string;
  agents: number;
  needs: number;
  stuck: number;
}

/** Agents per project across the portfolio, the ones needing attention first. */
export function portfolio(figures: readonly AgentFigure[]): ProjectRollup[] {
  const m = new Map<string, ProjectRollup>();
  for (const f of figures) {
    const key = f.project_id ?? "Organization";
    const r = m.get(key) ?? { project: key, agents: 0, needs: 0, stuck: 0 };
    r.agents++;
    if (f.state === "needs") r.needs++;
    if (f.state === "stuck") r.stuck++;
    m.set(key, r);
  }
  return [...m.values()].sort((a, b) => b.needs - a.needs || b.stuck - a.stuck || a.project.localeCompare(b.project));
}
