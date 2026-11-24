import "./workflow.css";
import { useEffect, useMemo, useState } from "react";
import type { CheckIn } from "../api/types.js";
import { CHECK_IN_CHOICES, type AgentRow } from "../lib/agents.js";
import { buildCouncilFlow, councilOf } from "../lib/councilFlow.js";
import { WORKFLOWS, WORKFLOW_LABEL, type Workflow } from "../lib/workflow.js";
import { workflowApi, type CardWorkflowRunLogEntry, type WorkflowScope } from "../lib/workflowApi.js";
import {
  addImportedRepoLane,
  addSkillToStage,
  addStage,
  addUserModel,
  applyUpstreamCheck,
  assignAgentToSkill,
  buildPresetSpec,
  createCustomPack,
  forkLane,
  importPackJson,
  moveSkill,
  removeLaneSkill,
  removeSkillFromStage,
  removeStage,
  reorderLaneSkill,
  reorderSkillInStage,
  reorderStage,
  resetLaneToUpstream,
  resolveLaneConflict,
  rollbackLane,
  setContextDepth,
  setLaneUpdatePolicy,
  validateWorkflowSpec,
  type ConflictChoice,
  type ContextDepth,
  type WorkflowSpecV1,
} from "../lib/workflowSpec.js";
import { AgentTray } from "./AgentTray.js";
import { CouncilStrip, DecisionMatrix, WorkflowDiagram } from "./WorkflowDiagram.js";
import { WorkflowEditorCanvas } from "./WorkflowEditorCanvas.js";
import { WorkflowSwimLanes } from "./WorkflowSwimLanes.js";

export type EditorView = "editor" | "council" | "matrix";

export interface WorkflowEditorProps {
  rows: readonly AgentRow[];
  initialCheckIn: CheckIn;
  packageId?: string;
  projectId?: string;
  projectName?: string;
  initialSpec?: WorkflowSpecV1;
  onSaveSpec?: (spec: WorkflowSpecV1) => Promise<void>;
}

export function WorkflowEditor({
  rows,
  initialCheckIn,
  packageId,
  projectId,
  projectName,
  initialSpec,
  onSaveSpec,
}: WorkflowEditorProps) {
  const [spec, setSpec] = useState<WorkflowSpecV1>(
    () => initialSpec ?? buildPresetSpec("superpowers", "light", initialCheckIn),
  );
  const [view, setView] = useState<EditorView>("editor");
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [checkingLaneId, setCheckingLaneId] = useState<string | null>(null);
  const [laneStatus, setLaneStatus] = useState<string | null>(null);
  const [cardRuns, setCardRuns] = useState<CardWorkflowRunLogEntry[]>([]);

  const scopeTarget: WorkflowScope = useMemo(
    () =>
      packageId
        ? { scope: "package", id: packageId }
        : projectId
          ? { scope: "project", id: projectId }
          : { scope: "default", id: "default" },
    [packageId, projectId],
  );

  useEffect(() => {
    if (initialSpec) return;
    let active = true;
    workflowApi
      .getSpec(scopeTarget)
      .then(async (res) => {
        if (!active) return;
        let current = res.spec;
        if (!res.offline) {
          setSpec(current);
        }
        // On-start check for lanes with auto-update policy (no background timers or cron).
        if (!res.offline && current.lanes.some((l) => l.enabled && l.updatePolicy === "auto")) {
          const check = await workflowApi.checkLaneUpdates(undefined, scopeTarget, current);
          if (!active) return;
          const changed = (check.results ?? []).filter(
            (r) => r.status === "updated" || r.status === "conflict_paused",
          );
          if (check.spec && changed.length > 0) {
            current = check.spec;
            setSpec(current);
            setLaneStatus(changed.map((c) => `${c.laneId}: ${c.summary}`).join(" · "));
          }
        }
      })
      .catch(() => {
        // Keep local default preset if API is unreachable
      });
    if (packageId) {
      workflowApi
        .getCardWorkflowLog(packageId)
        .then((log) => {
          if (active) setCardRuns(log.runs);
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [scopeTarget, packageId, initialSpec]);

  const council = useMemo(() => councilOf([...rows]), [rows]);
  const councilFlow = useMemo(
    () => buildCouncilFlow([...rows], spec.checkIn, spec.name),
    [rows, spec.checkIn, spec.name],
  );
  const validation = useMemo(() => validateWorkflowSpec(spec, council), [spec, council]);

  const mutateSpec = (updater: (current: WorkflowSpecV1) => WorkflowSpecV1) => {
    setSaveStatus(null);
    setSaveError(null);
    setSpec(updater);
  };

  const handlePresetChange = (preset: Workflow) => {
    mutateSpec((cur) => {
      const next = buildPresetSpec(preset, cur.contextDepth, cur.checkIn);
      return {
        ...next,
        userModels: cur.userModels,
      };
    });
  };

  const handleContextDepth = (depth: ContextDepth) => {
    mutateSpec((cur) => setContextDepth(cur, depth));
  };

  const handleCheckIn = (checkIn: CheckIn) => {
    mutateSpec((cur) => ({ ...cur, checkIn }));
  };

  const handleSave = async () => {
    if (!validation.valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (onSaveSpec) {
        await onSaveSpec(spec);
      } else {
        const res = await workflowApi.saveSpec(spec, scopeTarget);
        setSpec(res.spec);
      }
      setSaveStatus(
        packageId
          ? `Saved workflow for card ${packageId}.`
          : projectName
            ? `Saved workflow for ${projectName}.`
            : "Workflow saved.",
      );
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save workflow.");
    } finally {
      setSaving(false);
    }
  };

  const handleCheckUpdates = async (laneId: string) => {
    setCheckingLaneId(laneId);
    setLaneStatus(null);
    try {
      const res = await workflowApi.checkLaneUpdates(laneId, scopeTarget, spec);
      if (res.spec) {
        setSpec(res.spec);
        const summary = res.results?.find((r) => r.laneId === laneId)?.summary;
        setLaneStatus(summary ?? `Checked updates for ${laneId}.`);
      } else if (res.upstream) {
        mutateSpec((cur) => applyUpstreamCheck(cur, laneId, res.upstream!));
        setLaneStatus(`Upstream changes retrieved for ${laneId}.`);
      } else {
        setLaneStatus(`${laneId} is up to date.`);
      }
    } catch (err) {
      setLaneStatus(err instanceof Error ? err.message : "Update check failed.");
    } finally {
      setCheckingLaneId(null);
    }
  };

  const handleResolveConflict = async (laneId: string, resolutions: Record<string, ConflictChoice>) => {
    const nextSpec = resolveLaneConflict(spec, laneId, resolutions);
    setSpec(nextSpec);
    try {
      const res = await workflowApi.resolveLaneConflict(laneId, resolutions, scopeTarget, spec);
      if (res.spec) setSpec(res.spec);
      setLaneStatus(`Conflicts resolved for ${laneId}.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : `Could not persist conflict resolution for ${laneId}.`);
    }
  };

  const handleRollback = async (laneId: string) => {
    const nextSpec = rollbackLane(spec, laneId);
    setSpec(nextSpec);
    try {
      const res = await workflowApi.rollbackLane(laneId, undefined, scopeTarget, spec);
      if (res.spec) setSpec(res.spec);
      setLaneStatus(`Rolled back ${laneId} to previous version.`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : `Could not persist rollback for ${laneId}.`);
    }
  };

  const handleImportRepo = async (repoUrl: string, name?: string) => {
    const res = await workflowApi.importRepoLane(repoUrl, name, scopeTarget);
    mutateSpec((cur) => addImportedRepoLane(cur, res.lane));
    setLaneStatus(`Imported swim lane ${res.lane.name}.`);
  };

  return (
    <div className="wfe">
      <div className="wfe-topbar">
        <div className="wfe-controls-group">
          <div className="wfe-control">
            <label htmlFor="wfe-preset-select" className="wfe-control-label">
              Workflow preset
            </label>
            <select
              id="wfe-preset-select"
              className="wfe-select"
              value={spec.preset === "custom" ? "superpowers" : spec.preset}
              onChange={(e) => handlePresetChange(e.target.value as Workflow)}
            >
              {WORKFLOWS.map((w) => (
                <option key={w} value={w}>
                  {WORKFLOW_LABEL[w]}
                </option>
              ))}
            </select>
          </div>

          <div className="wfe-control">
            <span className="wfe-control-label">Context depth</span>
            <div className="seg" role="group" aria-label="Context depth">
              <button
                type="button"
                className={spec.contextDepth === "light" ? "active" : ""}
                aria-pressed={spec.contextDepth === "light"}
                onClick={() => handleContextDepth("light")}
              >
                Light
              </button>
              <button
                type="button"
                className={spec.contextDepth === "nuclear" ? "active" : ""}
                aria-pressed={spec.contextDepth === "nuclear"}
                onClick={() => handleContextDepth("nuclear")}
              >
                Nuclear
              </button>
            </div>
          </div>

          <div className="wfe-control">
            <label htmlFor="wfe-checkin-select" className="wfe-control-label">
              Check-ins
            </label>
            <select
              id="wfe-checkin-select"
              className="wfe-select"
              value={spec.checkIn}
              onChange={(e) => handleCheckIn(e.target.value as CheckIn)}
            >
              {CHECK_IN_CHOICES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="wfe-topbar-right">
          <div className="seg" role="group" aria-label="Workflow view">
            <button
              type="button"
              className={view === "editor" ? "active" : ""}
              aria-pressed={view === "editor"}
              onClick={() => setView("editor")}
            >
              Flow editor
            </button>
            <button
              type="button"
              className={view === "council" ? "active" : ""}
              aria-pressed={view === "council"}
              onClick={() => setView("council")}
            >
              Council flow
            </button>
            <button
              type="button"
              className={view === "matrix" ? "active" : ""}
              aria-pressed={view === "matrix"}
              onClick={() => setView("matrix")}
            >
              Decision matrix
            </button>
          </div>

          <button
            type="button"
            className="wfe-btn wfe-btn-primary"
            disabled={!validation.valid || saving}
            onClick={() => void handleSave()}
          >
            {saving ? "Saving..." : "Save as my workflow"}
          </button>
        </div>
      </div>

      <CouncilStrip flow={councilFlow} />

      {saveStatus && (
        <p className="wfe-banner wfe-banner-ok" role="status">
          {saveStatus}
        </p>
      )}
      {saveError && (
        <p className="wfe-banner wfe-banner-error" role="alert">
          {saveError}
        </p>
      )}

      {validation.errors.length > 0 && (
        <div className="wfe-banner wfe-banner-error" role="alert">
          <strong>Cannot save until resolved:</strong>
          <ul className="wfe-issue-list">
            {validation.errors.map((issue, idx) => (
              <li key={`${issue.code}-${idx}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {validation.warnings.length > 0 && (
        <div className="wfe-banner wfe-banner-warn" role="status">
          {validation.warnings.map((w, idx) => (
            <div key={`${w.code}-${idx}`}>{w.message}</div>
          ))}
        </div>
      )}

      {view === "editor" && (
        <div className="wfe-workspace">
          <AgentTray
            rows={rows}
            userModels={spec.userModels}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
            onAddUserModel={(name) => mutateSpec((cur) => addUserModel(cur, name))}
          />

          <WorkflowEditorCanvas
            spec={spec}
            council={council}
            validation={validation}
            selectedAgentId={selectedAgentId}
            onAddStage={(stage) => mutateSpec((cur) => addStage(cur, stage))}
            onRemoveStage={(stageId) => mutateSpec((cur) => removeStage(cur, stageId))}
            onReorderStage={(stageId, dir) => mutateSpec((cur) => reorderStage(cur, stageId, dir))}
            onAddSkillToStage={(stageId, skill) => mutateSpec((cur) => addSkillToStage(cur, stageId, skill))}
            onRemoveSkillFromStage={(stageId, blockId) => mutateSpec((cur) => removeSkillFromStage(cur, stageId, blockId))}
            onMoveSkill={(blockId, targetStageId) => mutateSpec((cur) => moveSkill(cur, blockId, targetStageId))}
            onReorderSkillInStage={(stageId, blockId, dir) =>
              mutateSpec((cur) => reorderSkillInStage(cur, stageId, blockId, dir))
            }
            onAssignAgentToSkill={(blockId, agentId) =>
              mutateSpec((cur) => assignAgentToSkill(cur, blockId, agentId, council))
            }
          />

          <WorkflowSwimLanes
            spec={spec}
            checkingLaneId={checkingLaneId}
            statusMessage={laneStatus}
            onForkLane={(laneId) => mutateSpec((cur) => forkLane(cur, laneId))}
            onResetLane={(laneId) => mutateSpec((cur) => resetLaneToUpstream(cur, laneId))}
            onSetUpdatePolicy={(laneId, policy) => mutateSpec((cur) => setLaneUpdatePolicy(cur, laneId, policy))}
            onCheckUpdates={(laneId) => void handleCheckUpdates(laneId)}
            onResolveConflict={(laneId, resolutions) => void handleResolveConflict(laneId, resolutions)}
            onRollbackLane={(laneId) => void handleRollback(laneId)}
            onReorderLaneSkill={(laneId, skill, dir) => mutateSpec((cur) => reorderLaneSkill(cur, laneId, skill, dir))}
            onRemoveLaneSkill={(laneId, skill) => mutateSpec((cur) => removeLaneSkill(cur, laneId, skill))}
            onAddLaneSkillToStage={(stageId, skill) => mutateSpec((cur) => addSkillToStage(cur, stageId, skill))}
            onCreateCustomPack={(opts) => {
              const nextSpec = createCustomPack(spec, opts);
              mutateSpec(() => nextSpec);
              const created = nextSpec.lanes[nextSpec.lanes.length - 1];
              if (!onSaveSpec && created) {
                void workflowApi.saveCustomPack(created, scopeTarget).catch(() => {});
              }
              setLaneStatus(`Created custom pack "${opts.name}".`);
            }}
            onImportRepoUrl={handleImportRepo}
            onImportPackJson={(raw) => {
              const nextSpec = importPackJson(spec, raw);
              mutateSpec(() => nextSpec);
              const imported = nextSpec.lanes[nextSpec.lanes.length - 1];
              if (!onSaveSpec && imported) {
                void workflowApi.saveCustomPack(imported, scopeTarget).catch(() => {});
              }
              setLaneStatus("Imported custom pack from JSON.");
            }}
          />
        </div>
      )}

      {view === "council" && <WorkflowDiagram flow={councilFlow} initialView="flow" />}
      {view === "matrix" && <DecisionMatrix flow={councilFlow} />}

      {packageId && (
        <section className="wfe-lanes" aria-label="Recorded card skill versions">
          <div className="wfe-lanes-head">
            <div>
              <h2 className="wfe-lanes-title">Card run log</h2>
              <p className="wfe-tray-hint">
                Every run on card {packageId} records the exact skill versions, commits, and digests used.
              </p>
            </div>
          </div>
          {cardRuns.length === 0 ? (
            <p className="muted small">No runs recorded for this card yet.</p>
          ) : (
            <ul className="wfe-diff-list">
              {cardRuns.map((entry) => (
                <li key={entry.eventId} className="wfe-lane">
                  <div className="wfe-lane-meta">
                    <strong>{entry.role ?? "run"}</strong>
                    <span>{entry.workflow ?? "workflow"}</span>
                    {entry.spec_version && <span className="mono">spec v{entry.spec_version}</span>}
                    <span>{entry.at}</span>
                    {entry.nuclear_lane_modified?.modified && (
                      <span className="wfe-pill wfe-pill-amber">Nuclear lane modified</span>
                    )}
                  </div>
                  {entry.skill_versions && entry.skill_versions.length > 0 && (
                    <div className="wfe-lane-meta">
                      {entry.skill_versions.map((sv, i) => (
                        <span key={`${sv.lane}-${sv.skill}-${i}`} className="wfe-pill">
                          {sv.lane}:{sv.skill} @ {sv.commit.slice(0, 7)}
                          {sv.agent ? ` (${sv.agent})` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
