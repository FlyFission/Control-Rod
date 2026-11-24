import "@xyflow/react/dist/base.css";
import { Background, BackgroundVariant, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { type CouncilFlow, type EdgeKind, type FlowStep, SEND_BACKS } from "../lib/councilFlow.js";
import { type Direction, GAP, type Layout, layoutFlow } from "../lib/councilLayout.js";
import { AgentMark } from "./AgentMark.js";
import { KeyGlyph, STOP_LABEL } from "./workflowParts.js";

/**
 * The block flow canvas: React Flow (MIT) draws the blocks and edges that councilLayout placed. It is
 * loaded only when a diagram is shown, so the rest of the app does not carry it.
 */

const ROLE_LABEL = { planner: "Planner", author: "Author", fallback: "Stand-in author", checker: "Blind checker" } as const;
type StepNode = Node<{ step: FlowStep; direction: Direction }, FlowStep["kind"]>;

/** Hidden handles on every side, so an edge can leave or enter wherever the layout needs it. */
function Sides() {
  return (
    <>
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Fragment key={side}>
          <Handle type="target" id={`${side}-in`} position={side as Position} isConnectable={false} className="wf-handle" />
          <Handle type="source" id={`${side}-out`} position={side as Position} isConnectable={false} className="wf-handle" />
        </Fragment>
      ))}
    </>
  );
}

function AgentBlock({ data }: NodeProps<StepNode>) {
  const { step } = data;
  const seat = step.seat;
  return (
    <div className={`wf-block wf-agent wf-role-${step.role}${seat ? "" : " wf-empty"}`}>
      <Sides />
      <div className="wf-agent-head">
        {seat ? <AgentMark id={seat.id} name={seat.name} size={40} /> : <span className="agent-mark agent-mark-initial wf-seat-empty" aria-hidden="true" />}
        <div className="wf-agent-who">
          <span className="wf-role">{step.role ? ROLE_LABEL[step.role] : ""}</span>
          <strong>{seat ? seat.name : "Empty seat"}</strong>
          {seat && <span className={`wf-lamp ${seat.ready ? "ready" : "waiting"}`}>{seat.ready ? "Ready" : "Not ready yet"}</span>}
        </div>
      </div>
      <div className="wf-step-title">
        {step.title}
        {step.method && <span className="wf-method">{step.method}</span>}
      </div>
      <div className="wf-step-detail">{step.detail}</div>
    </div>
  );
}

function YouBlock({ data }: NodeProps<StepNode>) {
  const { step } = data;
  return (
    <div className={`wf-block wf-you wf-stop-${step.stop}`}>
      <Sides />
      <div className="wf-you-head">
        <span className="wf-you-badge">
          <KeyGlyph /> You
        </span>
        <span className="wf-stop">{step.stop ? STOP_LABEL[step.stop] : ""}</span>
      </div>
      <div className="wf-step-title">{step.title}</div>
      <div className="wf-step-detail">{step.detail}</div>
    </div>
  );
}

function DecisionBlock({ data }: NodeProps<StepNode>) {
  return (
    <div className="wf-decision" title={data.step.detail}>
      <Sides />
      <span className="wf-diamond" aria-hidden="true" />
      <span className="wf-decision-text">{data.step.title}</span>
    </div>
  );
}

function TerminalBlock({ data }: NodeProps<StepNode>) {
  return (
    <div className={`wf-terminal wf-${data.step.kind}`} title={data.step.detail}>
      <Sides />
      {data.step.title}
    </div>
  );
}

const NODE_TYPES = { agent: AgentBlock, you: YouBlock, decision: DecisionBlock, start: TerminalBlock, end: TerminalBlock };

/**
 * Which sides an edge leaves and enters. Along the main line and along the branch lane, edges run in the
 * diagram's direction. An edge out to the branch lane leaves from the side facing the lane and comes in
 * from behind; an edge back to the main line comes in from behind, through the clear gap the layout
 * leaves before the block it joins. The send-back loop runs on the free side.
 */
function sides(kind: string, direction: Direction, fromLine: boolean, toLine: boolean): { from: string; to: string } {
  const lr = direction === "LR";
  if (kind === "send-back") return lr ? { from: "top", to: "top" } : { from: "right", to: "right" };
  if (fromLine && !toLine) return lr ? { from: "bottom", to: "left" } : { from: "left", to: "top" };
  return lr ? { from: "right", to: "left" } : { from: "bottom", to: "top" };
}

/** The send-back loop clears the widest block on the main line, not just the decision it leaves. */
function loopOffset(layout: Layout, from: string, direction: Direction): number {
  const lr = direction === "LR";
  const across = (id: string) => (lr ? layout.placed.get(id)!.height : layout.placed.get(id)!.width);
  const lane = Math.max(...layout.spine.map(across));
  return (lr ? 40 : 64) + (lane - across(from)) / 2;
}

/** For an edge rejoining the main line, turn halfway through the gap before the block it joins. */
function joinStep(layout: Layout, from: string, to: string, direction: Direction): number | undefined {
  const a = layout.placed.get(from)!;
  const b = layout.placed.get(to)!;
  const lr = direction === "LR";
  const span = lr ? b.x - (a.x + a.width) : b.y - (a.y + a.height);
  if (span <= 0) return undefined;
  return Math.min(1, Math.max(0, (span - GAP[direction] / 2) / span));
}

const EDGE_CLASS: Record<EdgeKind, string> = {
  flow: "wf-edge-flow",
  yes: "wf-edge-flow",
  baton: "wf-edge-baton",
  fallback: "wf-edge-fallback",
  "send-back": "wf-edge-sendback",
  no: "wf-edge-no",
};

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** The smallest the diagram is drawn before it scrolls sideways instead. */
const MIN_SCALE = 0.75;

export default function FlowDiagram({ flow }: { flow: CouncilFlow }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const direction: Direction = width > 0 && width < 720 ? "TB" : "LR";
  const layout = useMemo(() => layoutFlow(flow.steps, flow.edges, direction), [flow, direction]);
  // Fit the whole flow, never larger than its drawn size, with room for the send-back loop: over the
  // top on a wide screen, down the right on a phone.
  const loopTop = direction === "LR" ? 64 : 0;
  const loopRight = direction === "TB" ? 120 : 0; // the loop and its label
  // Below MIN_SCALE the type gets too small to read, so a long flow scrolls sideways inside its frame.
  const fit = width > 0 ? Math.min(1, (width - 24) / (layout.width + loopRight)) : 1;
  const scrolls = fit < MIN_SCALE;
  const scale = scrolls ? MIN_SCALE : fit;
  const height = Math.ceil((layout.height + loopTop) * scale) + 28;
  const inner = scrolls ? Math.ceil((layout.width + loopRight) * scale) + 24 : width;
  // On a phone the main line runs down the right and the branches sit to its left, so a flow too wide
  // for the screen opens scrolled to the main line.
  useEffect(() => {
    const el = ref.current;
    if (el && scrolls) el.scrollLeft = direction === "TB" ? el.scrollWidth : 0;
  }, [ref, scrolls, direction, inner]);
  const offsetX = Math.max(12, (inner - (layout.width + loopRight) * scale) / 2);

  const nodes: StepNode[] = flow.steps.map((step) => {
    const p = layout.placed.get(step.id)!;
    return {
      id: step.id,
      type: step.kind,
      position: { x: p.x, y: p.y + loopTop },
      data: { step, direction },
      width: p.width,
      height: p.height,
      draggable: false,
      selectable: false,
      focusable: false,
    };
  });
  const edges: Edge[] = flow.edges.map((e) => {
    const fromLine = layout.spine.includes(e.from);
    const toLine = layout.spine.includes(e.to);
    const s = sides(e.kind, direction, fromLine, toLine);
    const step = !fromLine && toLine && e.kind !== "send-back" ? joinStep(layout, e.from, e.to, direction) : undefined;
    return {
      id: e.id,
      source: e.from,
      target: e.to,
      sourceHandle: `${s.from}-out`,
      targetHandle: `${s.to}-in`,
      type: "smoothstep",
      className: EDGE_CLASS[e.kind],
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      pathOptions: { borderRadius: 10, offset: e.kind === "send-back" ? loopOffset(layout, e.from, direction) : 18, ...(step !== undefined ? { stepPosition: step } : {}) },
      ...(e.label ? { label: direction === "TB" && e.kind === "send-back" ? `No: again, ≤${SEND_BACKS}×` : e.label, labelBgPadding: [6, 3] as [number, number], labelBgBorderRadius: 4, labelShowBg: true } : {}),
      focusable: false,
      selectable: false,
    };
  });

  return (
    // When the flow is wider than its frame, the frame is a labelled, focusable region so a keyboard can
    // scroll it; the drawing itself is hidden from assistive technology, which reads the step list instead.
    <div
      ref={ref}
      className={`wf-canvas${scrolls ? " wf-scrolls" : ""}`}
      style={{ height: height + (scrolls ? 12 : 0) }}
      {...(scrolls ? { role: "region", "aria-label": "Workflow diagram, scrolls sideways", tabIndex: 0 } : {})}
    >
      {width > 0 && (
        <div className="wf-inner" style={{ width: inner, height }} aria-hidden="true">
        <ReactFlow
          key={`${direction}-${Math.round(width)}-${layout.width}x${layout.height}-${flow.steps.length}`}
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          defaultViewport={{ x: offsetX, y: 14, zoom: scale }}
          minZoom={0.2}
          maxZoom={1}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
        >
          <Background variant={BackgroundVariant.Lines} gap={24} className="wf-grid" />
        </ReactFlow>
        </div>
      )}
    </div>
  );
}

