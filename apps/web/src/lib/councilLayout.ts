import dagre from "@dagrejs/dagre";
import type { FlowEdge, FlowStep, StepKind } from "./councilFlow.js";

/**
 * Places the workflow's blocks. dagre (MIT) ranks them, left to right on a wide screen and top to
 * bottom on a phone. Then the main line (the path a card takes when nothing goes wrong) is drawn
 * straight, as a block flow diagram is, and each branch (a stand-in author, a dispute) sits beside the
 * main-line block of its rank: below it on a wide screen, to its left on a phone. The send-back loop is
 * left out of the ranking and runs on the free side, over the top or down the right.
 */
export type Direction = "LR" | "TB";

export const BLOCK_SIZE: Record<StepKind, { width: number; height: number }> = {
  start: { width: 92, height: 56 },
  end: { width: 92, height: 56 },
  agent: { width: 204, height: 156 },
  you: { width: 184, height: 140 },
  decision: { width: 76, height: 76 },
};

/** Gap between a main-line block and a branch beside it. */
const BRANCH_GAP = 40;

export interface Placed {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  placed: Map<string, Placed>;
  /** The blocks on the main line, in order. */
  spine: string[];
  width: number;
  height: number;
}

/** The path from the first step along plain, baton and "yes" edges: what happens when nothing goes wrong. */
export function spineOf(steps: FlowStep[], edges: FlowEdge[]): string[] {
  const out: string[] = [];
  let at = steps[0]?.id;
  while (at && !out.includes(at)) {
    out.push(at);
    const next = edges.find((e) => e.from === at && (e.kind === "flow" || e.kind === "baton" || e.kind === "yes") && !out.includes(e.to));
    at = next?.to;
  }
  return out;
}

export function layoutFlow(steps: FlowStep[], edges: FlowEdge[], direction: Direction): Layout {
  const lr = direction === "LR";
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: direction, nodesep: 32, ranksep: lr ? 32 : 40, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const s of steps) g.setNode(s.id, { ...BLOCK_SIZE[s.kind] });
  for (const e of edges) if (e.kind !== "send-back") g.setEdge(e.from, e.to);
  dagre.layout(g);

  const spine = spineOf(steps, edges);
  const size = (id: string) => BLOCK_SIZE[steps.find((s) => s.id === id)!.kind];
  // Rank position (x on a wide screen, y on a phone) comes from dagre; the cross position is ours.
  const along = (id: string) => (lr ? g.node(id).x : g.node(id).y);
  const across = (id: string) => (lr ? size(id).height : size(id).width);
  const lane = Math.max(...spine.map(across));
  const centre = new Map<string, { a: number; c: number }>();
  for (const id of spine) centre.set(id, { a: along(id), c: lane / 2 });
  // Each branch goes beside the main-line block nearest its rank, stacking if a rank has several.
  const used = new Map<string, number>();
  for (const s of steps) {
    if (spine.includes(s.id)) continue;
    const a = along(s.id);
    const host = spine.reduce((best, id) => (Math.abs(along(id) - a) < Math.abs(along(best) - a) ? id : best), spine[0]!);
    const offset = used.get(host) ?? lane;
    centre.set(s.id, { a, c: offset + BRANCH_GAP + across(s.id) / 2 });
    used.set(host, offset + BRANCH_GAP + across(s.id));
  }
  const crossMax = Math.max(lane, ...used.values());

  const placed = new Map<string, Placed>();
  let alongMax = 0;
  for (const s of steps) {
    const { width: w, height: h } = BLOCK_SIZE[s.kind];
    const { a, c } = centre.get(s.id)!;
    // On a phone the branches sit to the left, so the cross axis is flipped.
    const x = lr ? a - w / 2 : crossMax - c - w / 2;
    const y = lr ? c - h / 2 : a - h / 2;
    placed.set(s.id, { id: s.id, x, y, width: w, height: h });
    alongMax = Math.max(alongMax, lr ? x + w : y + h);
  }
  return { placed, spine, width: lr ? alongMax : crossMax, height: lr ? crossMax : alongMax };
}
