import type { FlowEdge, FlowStep, StepKind } from "./councilFlow.js";

/**
 * Places the workflow's blocks as a process engineer draws a block flow diagram: the main line (the path
 * a card takes when nothing goes wrong) runs straight, left to right on a wide screen and top to bottom
 * on a phone, and each branch (a stand-in author and its check, a dispute) runs in a lane beside it:
 * below on a wide screen, to the left on a phone. A branch block starts just after the block it comes
 * from and moves along past any branch block already in its lane. The send-back loop runs on the free
 * side, over the top or down the right. The flow is a short line with a few branches, so this is a few
 * lines of arithmetic rather than a general graph layout.
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

/** Gap between blocks along the line. */
export const GAP = { LR: 32, TB: 40 } as const;

export function layoutFlow(steps: FlowStep[], edges: FlowEdge[], direction: Direction): Layout {
  const lr = direction === "LR";
  const gap = GAP[direction];
  const size = (id: string) => BLOCK_SIZE[steps.find((s) => s.id === id)!.kind];
  const alongSize = (id: string) => (lr ? size(id).width : size(id).height);
  const acrossSize = (id: string) => (lr ? size(id).height : size(id).width);

  const spine = spineOf(steps, edges);
  const lane = Math.max(...spine.map(acrossSize));
  // Along the line: [start, end] for every block. Across: the main line is centred in its lane; branch
  // blocks share one lane beside it, aligned to its near edge.
  const branches = steps.filter((s) => !spine.includes(s.id)).map((s) => s.id);
  // A branch that rejoins the main line must end before the block it joins starts, so its edge can come in
  // from the side through a clear gap. Place everything, push any such block along, and place again.
  const minStart = new Map<string, number>();
  let along = new Map<string, { start: number; end: number }>();
  for (let pass = 0; pass < 8; pass++) {
    along = place();
    let moved = false;
    for (const e of edges) {
      if (e.kind === "send-back" || !branches.includes(e.from) || !spine.includes(e.to)) continue;
      const need = along.get(e.from)!.end + gap;
      if (along.get(e.to)!.start < need) {
        minStart.set(e.to, need);
        moved = true;
      }
    }
    if (!moved) break;
  }

  function place() {
    const out = new Map<string, { start: number; end: number }>();
    let at = 0;
    for (const id of spine) {
      at = Math.max(at, minStart.get(id) ?? 0);
      out.set(id, { start: at, end: at + alongSize(id) });
      at += alongSize(id) + gap;
    }
    const placedBranches: string[] = [];
    for (const id of branches) {
      const from = edges.find((e) => e.to === id && e.kind !== "send-back" && out.has(e.from))?.from;
      let start = from ? out.get(from)!.end + gap : 0;
      // Move along past any branch block already in the lane.
      for (let moved = true; moved; ) {
        moved = false;
        for (const other of placedBranches) {
          const o = out.get(other)!;
          if (start < o.end + gap && o.start < start + alongSize(id) + gap) {
            start = o.end + gap;
            moved = true;
          }
        }
      }
      out.set(id, { start, end: start + alongSize(id) });
      placedBranches.push(id);
    }
    return out;
  }
  const branchLane = branches.length > 0 ? Math.max(...branches.map(acrossSize)) : 0;
  const crossMax = lane + (branchLane > 0 ? BRANCH_GAP + branchLane : 0);

  const placed = new Map<string, Placed>();
  let alongMax = 0;
  for (const s of steps) {
    const { width: w, height: h } = BLOCK_SIZE[s.kind];
    const a = along.get(s.id)!.start;
    const onLine = spine.includes(s.id);
    // Distance from the main line's outer edge, across the line.
    const c = onLine ? (lane - acrossSize(s.id)) / 2 : lane + BRANCH_GAP;
    // On a phone the branch lane sits to the left, so the cross axis is flipped.
    const x = lr ? a : crossMax - c - w;
    const y = lr ? c : a;
    placed.set(s.id, { id: s.id, x, y, width: w, height: h });
    alongMax = Math.max(alongMax, lr ? x + w : y + h);
  }
  return { placed, spine, width: lr ? alongMax : crossMax, height: lr ? crossMax : alongMax };
}
