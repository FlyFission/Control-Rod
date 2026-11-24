import { useState, type DragEvent, type FormEvent } from "react";
import { AGENTS, type AgentRow } from "../lib/agents.js";
import { displayNameForAgent } from "../lib/workflowSpec.js";
import { AgentMark } from "./AgentMark.js";

export const AGENT_DRAG_MIME = "application/x-controlrod-agent";

export interface AgentTrayProps {
  rows: readonly AgentRow[];
  userModels: readonly string[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string | null) => void;
  onAddUserModel: (modelName: string) => void;
}

export function AgentTray({
  rows,
  userModels,
  selectedAgentId,
  onSelectAgent,
  onAddUserModel,
}: AgentTrayProps) {
  const [draftModel, setDraftModel] = useState("");
  const [addingModel, setAddingModel] = useState(false);

  const rowMap = new Map(rows.map((r) => [r.info.id, r]));

  const handleDragStart = (e: DragEvent<HTMLElement>, agentId: string) => {
    e.dataTransfer.setData(AGENT_DRAG_MIME, agentId);
    e.dataTransfer.setData("text/plain", agentId);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleAddSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = draftModel.trim();
    if (!trimmed) return;
    onAddUserModel(trimmed);
    setDraftModel("");
    setAddingModel(false);
  };

  return (
    <section className="wfe-tray" aria-label="Available agents">
      <div className="wfe-tray-head">
        <div>
          <h2 className="wfe-tray-title">Available agents</h2>
          <p className="wfe-tray-hint">
            Drag an agent onto any skill block, or select one here and click a skill to assign it.
          </p>
        </div>
        <div className="wfe-tray-actions">
          {selectedAgentId && (
            <button
              type="button"
              className="wfe-btn wfe-btn-ghost"
              onClick={() => onSelectAgent(null)}
            >
              Clear selection ({displayNameForAgent(selectedAgentId)})
            </button>
          )}
          {!addingModel ? (
            <button
              type="button"
              className="wfe-btn"
              onClick={() => setAddingModel(true)}
            >
              + User model
            </button>
          ) : (
            <form className="wfe-user-model-form" onSubmit={handleAddSubmit}>
              <label className="sr-only" htmlFor="wfe-user-model-input">
                User model name
              </label>
              <input
                id="wfe-user-model-input"
                type="text"
                className="wfe-input"
                placeholder="e.g. llama-3.3-70b"
                value={draftModel}
                onChange={(e) => setDraftModel(e.target.value)}
                autoFocus
              />
              <button type="submit" className="wfe-btn wfe-btn-primary">
                Add
              </button>
              <button
                type="button"
                className="wfe-btn wfe-btn-ghost"
                onClick={() => {
                  setAddingModel(false);
                  setDraftModel("");
                }}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>

      <ul className="wfe-agent-list" role="list">
        {AGENTS.map((agent) => {
          const row = rowMap.get(agent.id);
          const ready = row?.state === "ready";
          const selected = selectedAgentId === agent.id;
          return (
            <li key={agent.id}>
              <button
                type="button"
                className={`wfe-agent-chip${selected ? " selected" : ""}${!agent.runnable ? " coming-soon" : ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, agent.id)}
                onClick={() => onSelectAgent(selected ? null : agent.id)}
                aria-pressed={selected}
                title={agent.runnable ? `${agent.name} (${agent.vendor})` : `${agent.name} — Coming soon`}
              >
                <AgentMark id={agent.id} name={agent.name} size={24} />
                <span className="wfe-agent-chip-meta">
                  <strong className="wfe-agent-chip-name">{agent.name}</strong>
                  {!agent.runnable ? (
                    <span className="wfe-pill wfe-pill-coming">Coming soon</span>
                  ) : (
                    <span className={`wfe-lamp ${ready ? "ready" : "waiting"}`}>
                      {ready ? "Ready" : "Seated"}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}

        {userModels.map((modelId) => {
          const label = displayNameForAgent(modelId);
          const selected = selectedAgentId === modelId;
          return (
            <li key={modelId}>
              <button
                type="button"
                className={`wfe-agent-chip wfe-agent-user${selected ? " selected" : ""}`}
                draggable
                onDragStart={(e) => handleDragStart(e, modelId)}
                onClick={() => onSelectAgent(selected ? null : modelId)}
                aria-pressed={selected}
                title={`User model: ${label}`}
              >
                <AgentMark id={modelId} name={label} size={24} />
                <span className="wfe-agent-chip-meta">
                  <strong className="wfe-agent-chip-name">{label}</strong>
                  <span className="wfe-pill">User model</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
