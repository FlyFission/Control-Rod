import "@xyflow/react/dist/base.css";
import {
  Background,
  BackgroundVariant,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import { AGENTS } from "../lib/agents.js";
import type { Council } from "../lib/councilFlow.js";
import {
  displayNameForAgent,
  formatSkillLabel,
  stageDefaultAgent,
  type SkillBlockSpec,
  type WorkflowLaneSpec,
  type WorkflowSpecV1,
  type WorkflowStageRole,
  type WorkflowStageSpec,
  type WorkflowValidationResult,
} from "../lib/workflowSpec.js";
import { AgentMark } from "./AgentMark.js";
import { AGENT_DRAG_MIME } from "./AgentTray.js";

export const SKILL_BLOCK_DRAG_MIME = "application/x-controlrod-skill-block";
export const LANE_SKILL_DRAG_MIME = "application/x-controlrod-lane-skill";

export interface WorkflowEditorCanvasProps {
  spec: WorkflowSpecV1;
  council: Council;
  validation: WorkflowValidationResult;
  selectedAgentId: string | null;
  onAddStage: (stage: { label: string; role: WorkflowStageRole }) => void;
  onRemoveStage: (stageId: string) => void;
  onReorderStage: (stageId: string, direction: "earlier" | "later") => void;
  onAddSkillToStage: (stageId: string, skill: { packId: string; skill: string; label?: string; agent?: string | null }) => void;
  onRemoveSkillFromStage: (stageId: string, blockId: string) => void;
  onMoveSkill: (blockId: string, targetStageId: string) => void;
  onReorderSkillInStage: (stageId: string, blockId: string, direction: "earlier" | "later") => void;
  onAssignAgentToSkill: (blockId: string, agentId: string | null) => void;
}

interface StageNodeData extends Record<string, unknown> {
  stage: WorkflowStageSpec;
  stageIndex: number;
  totalStages: number;
  allStages: readonly WorkflowStageSpec[];
  council: Council;
  lanes: readonly WorkflowLaneSpec[];
  userModels: readonly string[];
  validation: WorkflowValidationResult;
  selectedAgentId: string | null;
  direction: "LR" | "TB";
  onRemoveStage: (stageId: string) => void;
  onReorderStage: (stageId: string, direction: "earlier" | "later") => void;
  onAddSkillToStage: (stageId: string, skill: { packId: string; skill: string; label?: string; agent?: string | null }) => void;
  onRemoveSkillFromStage: (stageId: string, blockId: string) => void;
  onMoveSkill: (blockId: string, targetStageId: string) => void;
  onReorderSkillInStage: (stageId: string, blockId: string, direction: "earlier" | "later") => void;
  onAssignAgentToSkill: (blockId: string, agentId: string | null) => void;
}

type EditorStageNode = Node<StageNodeData, "stage">;

const STAGE_WIDTH = 276;
const STAGE_GAP_X = 48;
const STAGE_GAP_Y = 36;

function estimateStageHeight(stage: WorkflowStageSpec, hasViolations = false): number {
  const base = 164;
  const perSkill = 148;
  const alertPad = hasViolations ? 44 : 0;
  return Math.max(240, base + stage.skills.length * perSkill + alertPad);
}

function StageBlockNode({ data }: NodeProps<EditorStageNode>) {
  const {
    stage,
    stageIndex,
    totalStages,
    allStages,
    council,
    lanes,
    userModels,
    validation,
    selectedAgentId,
    direction,
    onRemoveStage,
    onReorderStage,
    onAddSkillToStage,
    onRemoveSkillFromStage,
    onMoveSkill,
    onReorderSkillInStage,
    onAssignAgentToSkill,
  } = data;

  const [dragOverStage, setDragOverStage] = useState(false);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  const isChecker = Boolean(stage.isBlindChecker) || stage.role === "pre-check";
  const isAuthor = stage.role === "author";
  const defaultAgentId = stageDefaultAgent(stage, council);
  const defaultAgentName = defaultAgentId ? displayNameForAgent(defaultAgentId) : "Unassigned";
  const forkedLaneIds = new Set(lanes.filter((l) => l.forked).map((l) => l.id));

  const handleStageDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (
      e.dataTransfer.types.includes(SKILL_BLOCK_DRAG_MIME) ||
      e.dataTransfer.types.includes(LANE_SKILL_DRAG_MIME)
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverStage(true);
    }
  };

  const handleStageDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverStage(false);
    const blockId = e.dataTransfer.getData(SKILL_BLOCK_DRAG_MIME);
    if (blockId) {
      onMoveSkill(blockId, stage.id);
      return;
    }
    const lanePayload = e.dataTransfer.getData(LANE_SKILL_DRAG_MIME);
    if (lanePayload) {
      try {
        const parsed = JSON.parse(lanePayload) as { packId: string; skill: string; label?: string; agent?: string | null };
        if (parsed.packId && parsed.skill) {
          onAddSkillToStage(stage.id, parsed);
        }
      } catch {
        // Ignore malformed drop payload
      }
    }
  };

  const handleBlockDragStart = (e: DragEvent<HTMLElement>, block: SkillBlockSpec) => {
    e.stopPropagation();
    e.dataTransfer.setData(SKILL_BLOCK_DRAG_MIME, block.id);
    e.dataTransfer.setData("text/plain", block.skill);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleBlockDragOver = (e: DragEvent<HTMLElement>, blockId: string) => {
    if (e.dataTransfer.types.includes(AGENT_DRAG_MIME)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setDragOverBlockId(blockId);
    }
  };

  const handleBlockDrop = (e: DragEvent<HTMLElement>, blockId: string) => {
    const agentId = e.dataTransfer.getData(AGENT_DRAG_MIME);
    if (agentId) {
      e.preventDefault();
      e.stopPropagation();
      setDragOverBlockId(null);
      onAssignAgentToSkill(blockId, agentId);
    }
  };

  const handleInPos = direction === "LR" ? Position.Left : Position.Top;
  const handleOutPos = direction === "LR" ? Position.Right : Position.Bottom;

  return (
    <div
      className={`wfe-stage${isChecker ? " wfe-stage-checker" : ""}${!stage.built ? " wfe-stage-coming" : ""}${dragOverStage ? " wfe-drop-active" : ""}`}
      data-stage-id={stage.id}
      onDragOver={handleStageDragOver}
      onDragLeave={() => setDragOverStage(false)}
      onDrop={handleStageDrop}
    >
      <Handle type="target" position={handleInPos} isConnectable={false} className="wf-handle" />
      <Handle type="source" position={handleOutPos} isConnectable={false} className="wf-handle" />

      <div className="wfe-stage-head">
        <div className="wfe-stage-title-row">
          <h3 className="wfe-stage-title">{stage.label}</h3>
          <div className="wfe-stage-controls nodrag nopan">
            <button
              type="button"
              className="wfe-icon-btn"
              disabled={stageIndex === 0}
              aria-label={`Move ${stage.label} earlier`}
              title="Move stage earlier"
              onClick={() => onReorderStage(stage.id, "earlier")}
            >
              ←
            </button>
            <button
              type="button"
              className="wfe-icon-btn"
              disabled={stageIndex === totalStages - 1}
              aria-label={`Move ${stage.label} later`}
              title="Move stage later"
              onClick={() => onReorderStage(stage.id, "later")}
            >
              →
            </button>
            <button
              type="button"
              className="wfe-icon-btn wfe-icon-danger"
              disabled={totalStages <= 1}
              aria-label={`Remove ${stage.label}`}
              title="Remove stage"
              onClick={() => onRemoveStage(stage.id)}
            >
              ×
            </button>
          </div>
        </div>

        <div className="wfe-stage-meta">
          <span className="wfe-seat-badge">
            {defaultAgentId ? (
              <AgentMark id={defaultAgentId} name={defaultAgentName} size={18} />
            ) : null}
            <span>Council seat: {defaultAgentName}</span>
          </span>
          {!stage.built && <span className="wfe-pill wfe-pill-coming">Coming soon</span>}
          {isChecker && <span className="wfe-pill wfe-pill-checker">No fallback · blind</span>}
          {isAuthor && <span className="wfe-pill wfe-pill-fallback">Author fallback</span>}
        </div>
      </div>

      <div className="wfe-stage-skills nodrag nopan" role="list" aria-label={`${stage.label} skills`}>
        {stage.skills.length === 0 ? (
          <div className="wfe-stage-empty">Drop skills here from swim lanes</div>
        ) : (
          stage.skills.map((block, idx) => {
            const violations = validation.blockViolations[block.id] ?? [];
            const hasViolation = violations.length > 0;
            const effectiveAgent = block.agent ?? null;
            const isModified = forkedLaneIds.has(block.packId);
            const label = block.label ?? formatSkillLabel(block.skill);

            return (
              <div
                key={block.id}
                role="listitem"
                draggable
                onDragStart={(e) => handleBlockDragStart(e, block)}
                onDragOver={(e) => handleBlockDragOver(e, block.id)}
                onDragLeave={() => setDragOverBlockId(null)}
                onDrop={(e) => handleBlockDrop(e, block.id)}
                className={`wfe-skill${hasViolation ? " wfe-skill-violation" : ""}${dragOverBlockId === block.id ? " wfe-drop-active" : ""}`}
                data-block-id={block.id}
              >
                <div className="wfe-skill-top">
                  <div className="wfe-skill-info">
                    <span className="wfe-skill-name">{label}</span>
                    <span className="wfe-skill-pack">
                      {block.packId}
                      {isModified && <span className="wfe-pill wfe-pill-amber">Modified</span>}
                    </span>
                  </div>
                  <div className="wfe-skill-order">
                    <button
                      type="button"
                      className="wfe-icon-btn"
                      disabled={idx === 0}
                      aria-label={`Move ${label} earlier`}
                      onClick={() => onReorderSkillInStage(stage.id, block.id, "earlier")}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="wfe-icon-btn"
                      disabled={idx === stage.skills.length - 1}
                      aria-label={`Move ${label} later`}
                      onClick={() => onReorderSkillInStage(stage.id, block.id, "later")}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="wfe-icon-btn wfe-icon-danger"
                      aria-label={`Remove ${label}`}
                      onClick={() => onRemoveSkillFromStage(stage.id, block.id)}
                    >
                      ×
                    </button>
                  </div>
                </div>

                <div className="wfe-skill-assign">
                  <span className="wfe-skill-agent-display">
                    {effectiveAgent ? (
                      <>
                        <AgentMark id={effectiveAgent} name={displayNameForAgent(effectiveAgent)} size={18} />
                        <span>{displayNameForAgent(effectiveAgent)}</span>
                      </>
                    ) : (
                      <span className="muted">Council seat</span>
                    )}
                  </span>

                  <div className="wfe-skill-selects">
                    {selectedAgentId && (
                      <button
                        type="button"
                        className="wfe-btn wfe-btn-xs"
                        onClick={() => onAssignAgentToSkill(block.id, selectedAgentId)}
                      >
                        Assign {displayNameForAgent(selectedAgentId)}
                      </button>
                    )}
                    <select
                      className="wfe-select"
                      aria-label={`Assign agent for ${label}`}
                      value={block.agent ?? ""}
                      onChange={(e) => onAssignAgentToSkill(block.id, e.target.value || null)}
                    >
                      <option value="">Council seat ({defaultAgentName})</option>
                      {AGENTS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}{a.runnable ? "" : " (Coming soon)"}
                        </option>
                      ))}
                      {userModels.map((m) => (
                        <option key={m} value={m}>
                          {displayNameForAgent(m)}
                        </option>
                      ))}
                    </select>

                    <select
                      className="wfe-select"
                      aria-label={`Move ${label} to stage`}
                      value={stage.id}
                      onChange={(e) => onMoveSkill(block.id, e.target.value)}
                    >
                      {allStages.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {hasViolation && (
                  <p className="wfe-skill-alert" role="alert">
                    {violations[0]!.message}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const NODE_TYPES = { stage: StageBlockNode };

export function WorkflowEditorCanvas({
  spec,
  council,
  validation,
  selectedAgentId,
  onAddStage,
  onRemoveStage,
  onReorderStage,
  onAddSkillToStage,
  onRemoveSkillFromStage,
  onMoveSkill,
  onReorderSkillInStage,
  onAssignAgentToSkill,
}: WorkflowEditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({});
  const [addingStage, setAddingStage] = useState(false);
  const [newStageLabel, setNewStageLabel] = useState("");
  const [newStageRole, setNewStageRole] = useState<WorkflowStageRole>("custom");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (el.clientWidth > 0) setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        setWidth(entry.contentRect.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      const next: Record<string, number> = {};
      el.querySelectorAll<HTMLElement>("[data-stage-id]").forEach((nodeEl) => {
        const id = nodeEl.dataset.stageId;
        const rectH = Math.ceil(nodeEl.getBoundingClientRect().height || nodeEl.offsetHeight);
        if (id && rectH > 0) next[id] = rectH;
      });
      if (Object.keys(next).length > 0) {
        setMeasuredHeights((prev) => {
          const same =
            Object.keys(next).length === Object.keys(prev).length &&
            Object.entries(next).every(([k, v]) => prev[k] === v);
          return same ? prev : next;
        });
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    el.querySelectorAll<HTMLElement>("[data-stage-id]").forEach((nodeEl) => ro.observe(nodeEl));
    return () => ro.disconnect();
  }, [spec, width]);

  const direction: "LR" | "TB" = width < 720 ? "TB" : "LR";
  const stageWidth = direction === "LR" ? STAGE_WIDTH : Math.max(260, Math.min(480, width - 24));

  const { nodes, edges, canvasWidth, canvasHeight } = useMemo(() => {
    const builtNodes: EditorStageNode[] = [];
    const builtEdges: Edge[] = [];
    let cursorX = 16;
    let cursorY = 16;
    let maxH = 340;

    spec.stages.forEach((stage, index) => {
      const hasViolations = stage.skills.some((b) => (validation.blockViolations[b.id]?.length ?? 0) > 0);
      const h = Math.max(measuredHeights[stage.id] ?? 0, estimateStageHeight(stage, hasViolations));
      const pos = direction === "LR" ? { x: cursorX, y: 16 } : { x: 12, y: cursorY };
      builtNodes.push({
        id: stage.id,
        type: "stage",
        position: pos,
        width: stageWidth,
        height: h,
        style: { pointerEvents: "all", width: stageWidth },
        draggable: false,
        selectable: false,
        focusable: false,
        data: {
          stage,
          stageIndex: index,
          totalStages: spec.stages.length,
          allStages: spec.stages,
          council,
          lanes: spec.lanes,
          userModels: spec.userModels,
          validation,
          selectedAgentId,
          direction,
          onRemoveStage,
          onReorderStage,
          onAddSkillToStage,
          onRemoveSkillFromStage,
          onMoveSkill,
          onReorderSkillInStage,
          onAssignAgentToSkill,
        },
      });

      if (index > 0) {
        const prev = spec.stages[index - 1]!;
        const isBaton = Boolean(stage.isBlindChecker) || stage.role === "pre-check";
        builtEdges.push({
          id: `${prev.id}->${stage.id}`,
          source: prev.id,
          target: stage.id,
          type: "smoothstep",
          className: isBaton ? "wf-edge-baton" : "wf-edge-flow",
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
          focusable: false,
          selectable: false,
        });
      }

      if (direction === "LR") {
        cursorX += stageWidth + STAGE_GAP_X;
        maxH = Math.max(maxH, h + 40);
      } else {
        cursorY += h + STAGE_GAP_Y;
      }
    });

    return {
      nodes: builtNodes,
      edges: builtEdges,
      canvasWidth: direction === "LR" ? Math.max(width, cursorX) : Math.max(284, width - 2),
      canvasHeight: direction === "LR" ? maxH : cursorY + 24,
    };
  }, [
    spec,
    council,
    validation,
    selectedAgentId,
    direction,
    width,
    stageWidth,
    measuredHeights,
    onRemoveStage,
    onReorderStage,
    onAddSkillToStage,
    onRemoveSkillFromStage,
    onMoveSkill,
    onReorderSkillInStage,
    onAssignAgentToSkill,
  ]);

  const handleAddStageSubmit = (e: FormEvent) => {
    e.preventDefault();
    const label = newStageLabel.trim();
    if (!label) return;
    onAddStage({ label, role: newStageRole });
    setNewStageLabel("");
    setNewStageRole("custom");
    setAddingStage(false);
  };

  return (
    <section className="wfe-canvas-section" aria-label="Stage flow editor">
      <div className="wfe-canvas-toolbar">
        <div className="wfe-canvas-toolbar-title">
          <strong>Stages</strong>
          <span className="muted small">
            {spec.stages.length} stages · left-to-right execution order
          </span>
        </div>

        <div className="wfe-canvas-toolbar-actions">
          {!addingStage ? (
            <button
              type="button"
              className="wfe-btn"
              onClick={() => setAddingStage(true)}
            >
              + Add stage
            </button>
          ) : (
            <form className="wfe-add-stage-form" onSubmit={handleAddStageSubmit}>
              <label className="sr-only" htmlFor="wfe-new-stage-name">
                Stage name
              </label>
              <input
                id="wfe-new-stage-name"
                type="text"
                className="wfe-input"
                placeholder="Stage name"
                value={newStageLabel}
                onChange={(e) => setNewStageLabel(e.target.value)}
                autoFocus
              />
              <label className="sr-only" htmlFor="wfe-new-stage-role">
                Stage role
              </label>
              <select
                id="wfe-new-stage-role"
                className="wfe-select"
                value={newStageRole}
                onChange={(e) => setNewStageRole(e.target.value as WorkflowStageRole)}
              >
                <option value="custom">Custom (Coming soon)</option>
                <option value="intake">Intake</option>
                <option value="author">Author</option>
                <option value="pre-check">Blind check</option>
                <option value="review">Review (Coming soon)</option>
                <option value="ship">Ship (Coming soon)</option>
              </select>
              <button type="submit" className="wfe-btn wfe-btn-primary">
                Add
              </button>
              <button
                type="button"
                className="wfe-btn wfe-btn-ghost"
                onClick={() => {
                  setAddingStage(false);
                  setNewStageLabel("");
                }}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={`wf-canvas wfe-canvas${direction === "LR" ? " wf-scrolls" : " wfe-canvas-vertical"}`}
        style={{ height: canvasHeight }}
      >
        <div className="wfe-canvas-inner" style={{ width: canvasWidth, height: canvasHeight }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.5}
            maxZoom={1.2}
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
      </div>
    </section>
  );
}
