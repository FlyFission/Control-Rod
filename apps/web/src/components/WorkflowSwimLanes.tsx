import { useState, type DragEvent, type FormEvent } from "react";
import {
  diffLaneFromUpstream,
  exportPackJson,
  formatSkillLabel,
  type ConflictChoice,
  type LaneSkillEntry,
  type UpdatePolicy,
  type WorkflowLaneSpec,
  type WorkflowSpecV1,
} from "../lib/workflowSpec.js";
import { LANE_SKILL_DRAG_MIME } from "./WorkflowEditorCanvas.js";

export interface WorkflowSwimLanesProps {
  spec: WorkflowSpecV1;
  checkingLaneId?: string | null;
  statusMessage?: string | null;
  onForkLane: (laneId: string) => void;
  onResetLane: (laneId: string) => void;
  onSetUpdatePolicy: (laneId: string, policy: UpdatePolicy) => void;
  onCheckUpdates: (laneId: string) => void;
  onResolveConflict: (laneId: string, resolutions: Record<string, ConflictChoice>) => void;
  onRollbackLane: (laneId: string) => void;
  onReorderLaneSkill: (laneId: string, skill: string, direction: "earlier" | "later") => void;
  onRemoveLaneSkill: (laneId: string, skill: string) => void;
  onAddLaneSkillToStage: (stageId: string, skill: { packId: string; skill: string; label?: string; agent?: string | null }) => void;
  onCreateCustomPack: (options: { name: string; fromLaneId?: string }) => void;
  onImportRepoUrl: (repoUrl: string, name?: string) => Promise<void> | void;
  onImportPackJson: (rawJson: string) => void;
}

export function WorkflowSwimLanes({
  spec,
  checkingLaneId,
  statusMessage,
  onForkLane,
  onResetLane,
  onSetUpdatePolicy,
  onCheckUpdates,
  onResolveConflict,
  onRollbackLane,
  onReorderLaneSkill,
  onRemoveLaneSkill,
  onAddLaneSkillToStage,
  onCreateCustomPack,
  onImportRepoUrl,
  onImportPackJson,
}: WorkflowSwimLanesProps) {
  const [openDiffs, setOpenDiffs] = useState<Record<string, boolean>>({});
  const [conflictChoices, setConflictChoices] = useState<Record<string, Record<string, ConflictChoice>>>({});
  const [exportedText, setExportedText] = useState<{ laneName: string; json: string } | null>(null);

  // Toolbar modal/inline forms
  const [activeTool, setActiveTool] = useState<null | "new-pack" | "import-repo" | "import-json">(null);
  const [newPackName, setNewPackName] = useState("");
  const [newPackFrom, setNewPackFrom] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [repoName, setRepoName] = useState("");
  const [importJsonText, setImportJsonText] = useState("");
  const [toolError, setToolError] = useState<string | null>(null);

  const visibleLanes = spec.lanes.filter((l) => {
    if (l.kind === "context") return l.enabled || Boolean(l.packError);
    return true;
  });

  const handleSkillDragStart = (e: DragEvent<HTMLElement>, lane: WorkflowLaneSpec, entry: LaneSkillEntry) => {
    e.dataTransfer.setData(
      LANE_SKILL_DRAG_MIME,
      JSON.stringify({
        packId: lane.id,
        skill: entry.skill,
        label: entry.label ?? formatSkillLabel(entry.skill),
        agent: entry.agent ?? null,
      }),
    );
    e.dataTransfer.setData("text/plain", entry.skill);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleNewPackSubmit = (e: FormEvent) => {
    e.preventDefault();
    const name = newPackName.trim();
    if (!name) {
      setToolError("Enter a name for the new pack.");
      return;
    }
    onCreateCustomPack({ name, ...(newPackFrom ? { fromLaneId: newPackFrom } : {}) });
    setNewPackName("");
    setNewPackFrom("");
    setToolError(null);
    setActiveTool(null);
  };

  const handleImportRepoSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = repoUrl.trim();
    if (!trimmed) {
      setToolError("Enter a repository URL to import.");
      return;
    }
    setToolError(null);
    try {
      await onImportRepoUrl(trimmed, repoName.trim() || undefined);
      setRepoUrl("");
      setRepoName("");
      setActiveTool(null);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : "Could not import repository.");
    }
  };

  const handleImportJsonSubmit = (e: FormEvent) => {
    e.preventDefault();
    try {
      onImportPackJson(importJsonText);
      setImportJsonText("");
      setToolError(null);
      setActiveTool(null);
    } catch (err) {
      setToolError(err instanceof Error ? err.message : "Invalid pack JSON.");
    }
  };

  const handleExport = (lane: WorkflowLaneSpec) => {
    const json = exportPackJson(lane);
    setExportedText({ laneName: lane.name, json });
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(json).catch(() => {});
    }
  };

  return (
    <section className="wfe-lanes" aria-label="Skill swim lanes">
      <div className="wfe-lanes-head">
        <div>
          <h2 className="wfe-lanes-title">Swim lanes</h2>
          <p className="wfe-tray-hint">
            Packs in their native skill order. Keep as-is for automatic updates on start, or fork a lane to customize and freeze.
          </p>
        </div>

        <div className="wfe-lanes-toolbar">
          <button
            type="button"
            className={`wfe-btn${activeTool === "new-pack" ? " active" : ""}`}
            onClick={() => {
              setToolError(null);
              setActiveTool(activeTool === "new-pack" ? null : "new-pack");
            }}
          >
            New pack
          </button>
          <button
            type="button"
            className={`wfe-btn${activeTool === "import-repo" ? " active" : ""}`}
            onClick={() => {
              setToolError(null);
              setActiveTool(activeTool === "import-repo" ? null : "import-repo");
            }}
          >
            Import repo URL
          </button>
          <button
            type="button"
            className={`wfe-btn${activeTool === "import-json" ? " active" : ""}`}
            onClick={() => {
              setToolError(null);
              setActiveTool(activeTool === "import-json" ? null : "import-json");
            }}
          >
            Import JSON
          </button>
        </div>
      </div>

      {statusMessage && (
        <p className="wfe-status-line" role="status">
          {statusMessage}
        </p>
      )}

      {activeTool === "new-pack" && (
        <form className="wfe-tool-panel" onSubmit={handleNewPackSubmit}>
          <div className="wfe-tool-row">
            <label htmlFor="wfe-pack-name">Pack name</label>
            <input
              id="wfe-pack-name"
              type="text"
              className="wfe-input"
              placeholder="e.g. Team QA Pack"
              value={newPackName}
              onChange={(e) => setNewPackName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="wfe-tool-row">
            <label htmlFor="wfe-pack-from">Start from</label>
            <select
              id="wfe-pack-from"
              className="wfe-select"
              value={newPackFrom}
              onChange={(e) => setNewPackFrom(e.target.value)}
            >
              <option value="">Blank pack</option>
              {spec.lanes.map((l) => (
                <option key={l.id} value={l.id}>
                  Copy from {l.name}
                </option>
              ))}
            </select>
          </div>
          {toolError && <p role="alert" className="wfe-skill-alert">{toolError}</p>}
          <div className="wfe-tool-actions">
            <button type="submit" className="wfe-btn wfe-btn-primary">Create pack</button>
            <button type="button" className="wfe-btn wfe-btn-ghost" onClick={() => setActiveTool(null)}>Cancel</button>
          </div>
        </form>
      )}

      {activeTool === "import-repo" && (
        <form className="wfe-tool-panel" onSubmit={handleImportRepoSubmit}>
          <div className="wfe-tool-row">
            <label htmlFor="wfe-repo-url">Repository URL</label>
            <input
              id="wfe-repo-url"
              type="url"
              className="wfe-input"
              placeholder="https://github.com/org/skills-repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              autoFocus
            />
          </div>
          <div className="wfe-tool-row">
            <label htmlFor="wfe-repo-name">Display name (optional)</label>
            <input
              id="wfe-repo-name"
              type="text"
              className="wfe-input"
              placeholder="e.g. Acme Skills"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
            />
          </div>
          {toolError && <p role="alert" className="wfe-skill-alert">{toolError}</p>}
          <div className="wfe-tool-actions">
            <button type="submit" className="wfe-btn wfe-btn-primary">Import lane</button>
            <button type="button" className="wfe-btn wfe-btn-ghost" onClick={() => setActiveTool(null)}>Cancel</button>
          </div>
        </form>
      )}

      {activeTool === "import-json" && (
        <form className="wfe-tool-panel" onSubmit={handleImportJsonSubmit}>
          <div className="wfe-tool-row">
            <label htmlFor="wfe-import-json">Pack JSON</label>
            <textarea
              id="wfe-import-json"
              className="wfe-textarea"
              rows={5}
              placeholder='{"schema_version":"1.0.0","pack":{"name":"Shared Pack","skills":[]}}'
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              autoFocus
            />
          </div>
          {toolError && <p role="alert" className="wfe-skill-alert">{toolError}</p>}
          <div className="wfe-tool-actions">
            <button type="submit" className="wfe-btn wfe-btn-primary">Import pack JSON</button>
            <button type="button" className="wfe-btn wfe-btn-ghost" onClick={() => setActiveTool(null)}>Cancel</button>
          </div>
        </form>
      )}

      {exportedText && (
        <div className="wfe-tool-panel" role="region" aria-label={`Exported JSON for ${exportedText.laneName}`}>
          <div className="wfe-export-head">
            <strong>Exported {exportedText.laneName} JSON</strong>
            <button type="button" className="wfe-btn wfe-btn-ghost" onClick={() => setExportedText(null)}>
              Close
            </button>
          </div>
          <pre className="wfe-export-pre">{exportedText.json}</pre>
        </div>
      )}

      <div className="wfe-lane-list">
        {visibleLanes.map((lane) => {
          const diff = diffLaneFromUpstream(lane);
          const isNuclear = lane.id === "nuclear-grade" || Boolean(lane.nuclearRequired);
          const isModified = lane.forked || diff.hasChanges;
          const diffOpen = Boolean(openDiffs[lane.id]);
          const laneChoices = conflictChoices[lane.id] ?? {};

          return (
            <article
              key={lane.id}
              className={`wfe-lane${lane.packError ? " wfe-lane-error" : ""}${isNuclear && isModified ? " wfe-lane-warn" : ""}`}
              data-lane-id={lane.id}
            >
              <header className="wfe-lane-head">
                <div className="wfe-lane-ident">
                  <div className="wfe-lane-title-row">
                    <h3 className="wfe-lane-name">{lane.name}</h3>
                    <span className="wfe-pill">{lane.kind}</span>
                    {lane.forked && <span className="wfe-pill wfe-pill-amber">Modified from upstream</span>}
                    {isNuclear && !lane.packError && (
                      <span className="wfe-pill wfe-pill-verified" title={lane.source.digest}>
                        Digest verified · {lane.source.digest.slice(0, 14)}
                      </span>
                    )}
                  </div>
                  <div className="wfe-lane-meta">
                    <span className="mono">{lane.source.commit.slice(0, 10)}</span>
                    {lane.source.license && <span>{lane.source.license}</span>}
                    {lane.source.url && (
                      <span className="wfe-lane-url">{lane.source.url.replace(/^https?:\/\//, "")}</span>
                    )}
                  </div>
                </div>

                <div className="wfe-lane-controls">
                  {!lane.forked ? (
                    <button
                      type="button"
                      className="wfe-btn"
                      onClick={() => onForkLane(lane.id)}
                    >
                      Fork lane
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="wfe-btn"
                        aria-expanded={diffOpen}
                        onClick={() => setOpenDiffs((prev) => ({ ...prev, [lane.id]: !prev[lane.id] }))}
                      >
                        {diffOpen ? "Hide diff" : "Diff view"}
                      </button>
                      {lane.source.type !== "custom" && (
                        <button
                          type="button"
                          className="wfe-btn wfe-btn-ghost"
                          onClick={() => onResetLane(lane.id)}
                        >
                          Reset to upstream
                        </button>
                      )}
                    </>
                  )}

                  <div className="seg wfe-policy-seg" role="group" aria-label={`Update policy for ${lane.name}`}>
                    <button
                      type="button"
                      className={lane.updatePolicy === "auto" ? "active" : ""}
                      aria-pressed={lane.updatePolicy === "auto"}
                      onClick={() => onSetUpdatePolicy(lane.id, "auto")}
                    >
                      Auto-update
                    </button>
                    <button
                      type="button"
                      className={lane.updatePolicy === "freeze" ? "active" : ""}
                      aria-pressed={lane.updatePolicy === "freeze"}
                      onClick={() => onSetUpdatePolicy(lane.id, "freeze")}
                    >
                      Freeze
                    </button>
                  </div>

                  <button
                    type="button"
                    className="wfe-btn"
                    disabled={checkingLaneId === lane.id}
                    onClick={() => onCheckUpdates(lane.id)}
                  >
                    {checkingLaneId === lane.id ? "Checking..." : "Check updates"}
                  </button>

                  {lane.versions.length > 0 && (
                    <button
                      type="button"
                      className="wfe-btn"
                      onClick={() => onRollbackLane(lane.id)}
                    >
                      Rollback (v{lane.versions[lane.versions.length - 1]!.version})
                    </button>
                  )}

                  <button
                    type="button"
                    className="wfe-btn wfe-btn-ghost"
                    onClick={() => handleExport(lane)}
                  >
                    Export JSON
                  </button>
                </div>
              </header>

              {lane.packError && (
                <div className="wfe-banner wfe-banner-error" role="alert">
                  <strong>Blocked: pack failed to load</strong> — {lane.packError}
                </div>
              )}

              {isNuclear && isModified && !lane.packError && (
                <div className="wfe-banner wfe-banner-warn" role="status">
                  Nuclear lane modified — flagged before run
                </div>
              )}

              {diffOpen && (
                <div className="wfe-diff-panel" role="region" aria-label={`Diff for ${lane.name}`}>
                  <strong>Upstream diff ({lane.source.commit.slice(0, 10)})</strong>
                  {!diff.hasChanges ? (
                    <p className="muted small">Forked lane matches upstream skills right now. Reorder or remove skills below to customize.</p>
                  ) : (
                    <ul className="wfe-diff-list">
                      {diff.added.map((e) => (
                        <li key={`add-${e.skill}`} className="wfe-diff-add">+ Added: {e.label ?? formatSkillLabel(e.skill)}</li>
                      ))}
                      {diff.removed.map((e) => (
                        <li key={`rem-${e.skill}`} className="wfe-diff-rem">- Removed: {e.label ?? formatSkillLabel(e.skill)}</li>
                      ))}
                      {diff.reordered.map((sk) => (
                        <li key={`ord-${sk}`} className="wfe-diff-mod">~ Reordered: {formatSkillLabel(sk)}</li>
                      ))}
                      {diff.reassigned.map((r) => (
                        <li key={`asn-${r.skill}`} className="wfe-diff-mod">
                          ~ Reassigned: {formatSkillLabel(r.skill)} ({r.from ?? "council"} → {r.to ?? "council"})
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {lane.pendingConflict && (
                <div className="wfe-conflict-panel" role="region" aria-label={`Update conflicts for ${lane.name}`}>
                  <div className="wfe-conflict-head">
                    <strong>
                      Update paused: {lane.pendingConflict.conflicts.length} conflict
                      {lane.pendingConflict.conflicts.length === 1 ? "" : "s"} ({lane.pendingConflict.fromCommit.slice(0, 7)} → {lane.pendingConflict.toCommit.slice(0, 7)})
                    </strong>
                    <span className="muted small">Your local edits were preserved. Choose how to resolve each skill:</span>
                  </div>
                  <ul className="wfe-conflict-list">
                    {lane.pendingConflict.conflicts.map((c) => {
                      const chosen = laneChoices[c.skill] ?? "mine";
                      return (
                        <li key={c.skill} className="wfe-conflict-row">
                          <div>
                            <strong>{formatSkillLabel(c.skill)}</strong>
                            <span className="muted small"> · {c.reason}</span>
                          </div>
                          <div className="seg" role="group" aria-label={`Resolution for ${c.skill}`}>
                            <button
                              type="button"
                              className={chosen === "mine" ? "active" : ""}
                              aria-pressed={chosen === "mine"}
                              onClick={() =>
                                setConflictChoices((prev) => ({
                                  ...prev,
                                  [lane.id]: { ...(prev[lane.id] ?? {}), [c.skill]: "mine" },
                                }))
                              }
                            >
                              Keep mine
                            </button>
                            <button
                              type="button"
                              className={chosen === "upstream" ? "active" : ""}
                              aria-pressed={chosen === "upstream"}
                              onClick={() =>
                                setConflictChoices((prev) => ({
                                  ...prev,
                                  [lane.id]: { ...(prev[lane.id] ?? {}), [c.skill]: "upstream" },
                                }))
                              }
                            >
                              Take upstream
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    type="button"
                    className="wfe-btn wfe-btn-primary"
                    onClick={() => {
                      const resolved: Record<string, ConflictChoice> = {};
                      for (const c of lane.pendingConflict!.conflicts) {
                        resolved[c.skill] = laneChoices[c.skill] ?? "mine";
                      }
                      onResolveConflict(lane.id, resolved);
                    }}
                  >
                    Apply resolution
                  </button>
                </div>
              )}

              <ol className="wfe-lane-skills" aria-label={`${lane.name} skills`}>
                {lane.skills.length === 0 ? (
                  <li className="muted small">No skills in this pack yet.</li>
                ) : (
                  lane.skills.map((entry, idx) => {
                    const label = entry.label ?? formatSkillLabel(entry.skill);
                    const targetStage = spec.stages.some((s) => s.id === entry.defaultStage)
                      ? entry.defaultStage
                      : spec.stages[0]?.id ?? "author";
                    return (
                      <li
                        key={entry.skill}
                        className="wfe-lane-skill"
                        draggable
                        onDragStart={(e) => handleSkillDragStart(e, lane, entry)}
                      >
                        <div className="wfe-lane-skill-main">
                          <span className="wfe-lane-step-num">{idx + 1}</span>
                          <span className="wfe-lane-skill-label">{label}</span>
                          <span className="wfe-lane-stage-tag">{entry.defaultStage}</span>
                        </div>
                        <div className="wfe-lane-skill-actions">
                          <button
                            type="button"
                            className="wfe-btn wfe-btn-xs"
                            title={`Add ${label} to ${targetStage}`}
                            onClick={() =>
                              onAddLaneSkillToStage(targetStage, {
                                packId: lane.id,
                                skill: entry.skill,
                                label,
                                agent: entry.agent ?? null,
                              })
                            }
                          >
                            + Stage
                          </button>
                          {lane.forked && (
                            <>
                              <button
                                type="button"
                                className="wfe-icon-btn"
                                disabled={idx === 0}
                                aria-label={`Move ${label} earlier in ${lane.name}`}
                                onClick={() => onReorderLaneSkill(lane.id, entry.skill, "earlier")}
                              >
                                ←
                              </button>
                              <button
                                type="button"
                                className="wfe-icon-btn"
                                disabled={idx === lane.skills.length - 1}
                                aria-label={`Move ${label} later in ${lane.name}`}
                                onClick={() => onReorderLaneSkill(lane.id, entry.skill, "later")}
                              >
                                →
                              </button>
                              <button
                                type="button"
                                className="wfe-icon-btn wfe-icon-danger"
                                aria-label={`Remove ${label} from ${lane.name}`}
                                onClick={() => onRemoveLaneSkill(lane.id, entry.skill)}
                              >
                                ×
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })
                )}
              </ol>
            </article>
          );
        })}
      </div>
    </section>
  );
}
