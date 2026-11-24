import { useEffect, useState, type FormEvent } from "react";
import {
  AGENT_MODES,
  ROLE_ALIASES,
  deleteCustomAgent,
  loadCustomAgents,
  modeLabel,
  renderAgentPackMarkdown,
  resetCustomAgents,
  resolveAgentModel,
  saveCustomAgents,
  toggleCustomAgent,
  upsertCustomAgent,
  type AgentMode,
  type CustomAgentSpec,
  type RoleAlias,
} from "../lib/agentStudio.js";
import { loadCastingDraft, type CastingSheetDraft } from "../lib/casting.js";
import "./casting-desk.css";

export interface AgentStudioProps {
  castingDraft?: CastingSheetDraft;
}

/**
 * Custom Agent Studio — zero-terminal declarative specialist editor bound live to
 * the Casting Desk's `@role` assignments (`@author`, `@checker`, `@planner`, `@quick`).
 */
export function AgentStudio({ castingDraft }: AgentStudioProps = {}) {
  const effectiveCasting = castingDraft ?? loadCastingDraft();
  const [agents, setAgents] = useState<CustomAgentSpec[]>(() => loadCustomAgents());
  const [showForm, setShowForm] = useState(false);
  const [openPreviews, setOpenPreviews] = useState<Record<string, boolean>>({});
  const [copyStatus, setCopyStatus] = useState<Record<string, "" | "copied" | "failed">>({});

  // New specialist form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<AgentMode>("software");
  const [roleAlias, setRoleAlias] = useState<RoleAlias>("@checker");
  const [instructions, setInstructions] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    saveCustomAgents(agents);
  }, [agents]);

  const handleToggle = (id: string) => {
    setAgents((prev) => toggleCustomAgent(prev, id));
  };

  const handleDelete = (id: string) => {
    setAgents((prev) => deleteCustomAgent(prev, id));
    setOpenPreviews((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleTogglePreview = (id: string) => {
    setOpenPreviews((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyPack = (agent: CustomAgentSpec) => {
    const markdown = renderAgentPackMarkdown(agent);
    const done = navigator.clipboard?.writeText(markdown);
    if (!done) {
      setCopyStatus((prev) => ({ ...prev, [agent.id]: "failed" }));
      return;
    }
    done.then(
      () => setCopyStatus((prev) => ({ ...prev, [agent.id]: "copied" })),
      () => setCopyStatus((prev) => ({ ...prev, [agent.id]: "failed" })),
    );
  };

  const handleReset = () => {
    setAgents(resetCustomAgents());
    setOpenPreviews({});
    setCopyStatus({});
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setMode("software");
    setRoleAlias("@checker");
    setInstructions("");
    setFormError("");
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      setFormError("Enter a specialist name before saving.");
      return;
    }
    setAgents((prev) =>
      upsertCustomAgent(prev, {
        name,
        description: description.trim() || "Custom specialist bound to a Casting Desk role.",
        mode,
        roleAlias,
        instructions: instructions.trim() || "Follow project quality and verification rules for this role.",
        enabled: true,
      }),
    );
    resetForm();
    setShowForm(false);
  };

  const enabledCount = agents.filter((a) => a.enabled).length;
  const previewRole = resolveAgentModel({ roleAlias }, effectiveCasting);

  return (
    <section className="panel agent-studio" aria-labelledby="agent-studio-title">
      <div className="panel-head">
        <h2 id="agent-studio-title">Custom agent studio</h2>
        <div className="agent-studio-head-actions">
          <span className="tag">Packs draft</span>
          <button
            type="button"
            className="btn small"
            aria-expanded={showForm}
            onClick={() => {
              setShowForm((open) => !open);
              setFormError("");
            }}
          >
            {showForm ? "Close form" : "+ New specialist"}
          </button>
        </div>
      </div>

      <p className="casting-intro small">
        Declarative specialists for Software and Capital Projects. Each specialist binds to a Casting Desk{" "}
        <code className="mono">@role</code> so switching a preset or model above updates every matching specialist
        immediately.
      </p>

      <p className="casting-draft-notice small">
        <strong>Local packs/ draft</strong> — custom specialists are saved locally in this browser as a{" "}
        <code className="mono">packs/</code> draft. This studio never modifies CLI configs and stores no API keys or
        tokens.
      </p>

      {showForm && (
        <form className="agent-studio-form" aria-label="New specialist" onSubmit={handleCreate}>
          <div className="agent-studio-form-grid">
            <div className="casting-field">
              <label className="casting-field-label" htmlFor="agent-studio-name">
                Specialist name
              </label>
              <input
                id="agent-studio-name"
                type="text"
                className="agent-studio-input"
                placeholder="e.g. Piping Spec Auditor"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (formError) setFormError("");
                }}
              />
            </div>

            <div className="casting-field">
              <label className="casting-field-label" htmlFor="agent-studio-mode">
                Mode
              </label>
              <select
                id="agent-studio-mode"
                className="casting-select"
                value={mode}
                onChange={(e) => setMode(e.target.value as AgentMode)}
              >
                {AGENT_MODES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="casting-field">
              <label className="casting-field-label" htmlFor="agent-studio-role">
                Role binding
              </label>
              <select
                id="agent-studio-role"
                className="casting-select"
                value={roleAlias}
                onChange={(e) => setRoleAlias(e.target.value as RoleAlias)}
              >
                {ROLE_ALIASES.map((entry) => (
                  <option key={entry.alias} value={entry.alias}>
                    {entry.alias} ({entry.label})
                  </option>
                ))}
              </select>
            </div>

            <div className="casting-field">
              <label className="casting-field-label" htmlFor="agent-studio-desc">
                Short description
              </label>
              <input
                id="agent-studio-desc"
                type="text"
                className="agent-studio-input"
                placeholder="What this specialist checks or produces"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="casting-field">
            <label className="casting-field-label" htmlFor="agent-studio-instructions">
              Instructions
            </label>
            <textarea
              id="agent-studio-instructions"
              className="agent-studio-textarea"
              placeholder="Plain-language checklist or rules (no YAML required)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>

          <p className="muted small">
            Currently resolves <code className="mono">{roleAlias}</code> to{" "}
            <strong>{previewRole.model.label}</strong> ({previewRole.model.vendor}, {previewRole.effort}).
          </p>

          {formError && (
            <p role="alert" className="error small">
              {formError}
            </p>
          )}

          <div className="agent-studio-form-actions">
            <button type="submit" className="btn small">
              Save specialist
            </button>
            <button
              type="button"
              className="btn small"
              onClick={() => {
                resetForm();
                setShowForm(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="agent-studio-grid">
        {agents.map((agent) => {
          const resolved = resolveAgentModel(agent, effectiveCasting);
          const previewOpen = Boolean(openPreviews[agent.id]);
          const status = copyStatus[agent.id] ?? "";
          return (
            <article
              key={agent.id}
              className="casting-role-card agent-studio-card"
              data-enabled={agent.enabled}
              aria-labelledby={`agent-studio-card-${agent.id}`}
            >
              <div className="casting-role-head">
                <h3 id={`agent-studio-card-${agent.id}`} className="casting-role-title">
                  {agent.name}
                </h3>
                <div className="casting-role-badges">
                  <span className="tag">{modeLabel(agent.mode)}</span>
                  <span className="tag mono">{agent.roleAlias}</span>
                </div>
              </div>

              <p className="casting-role-desc">{agent.description}</p>

              <div className="agent-studio-resolved" aria-label={`${agent.name} resolved model`}>
                <span className="agent-studio-resolved-model">{resolved.model.label}</span>
                <span className="muted">{resolved.model.vendor}</span>
                <span className="tag">{resolved.effort}</span>
              </div>

              <div className="agent-studio-card-actions">
                <button
                  type="button"
                  role="switch"
                  className="casting-effort-btn"
                  aria-checked={agent.enabled}
                  aria-label={`${agent.enabled ? "Disable" : "Enable"} ${agent.name}`}
                  onClick={() => handleToggle(agent.id)}
                >
                  {agent.enabled ? "Enabled" : "Disabled"}
                </button>

                <div className="agent-studio-card-buttons">
                  <button
                    type="button"
                    className="btn small"
                    aria-expanded={previewOpen}
                    onClick={() => handleTogglePreview(agent.id)}
                  >
                    Pack preview
                  </button>
                  {!agent.builtIn && (
                    <button
                      type="button"
                      className="btn small"
                      aria-label={`Delete ${agent.name}`}
                      onClick={() => handleDelete(agent.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {previewOpen && (
                <div className="agent-studio-pack-box">
                  <div className="agent-studio-pack-head">
                    <span className="muted small mono">packs/{agent.id}.md</span>
                    <div className="agent-studio-card-buttons">
                      <button
                        type="button"
                        className="btn small"
                        aria-label={`Copy ${agent.name} pack markdown`}
                        onClick={() => handleCopyPack(agent)}
                      >
                        Copy
                      </button>
                      {status && (
                        <span role="status" className={status === "failed" ? "error small" : "muted small"}>
                          {status === "copied" ? "Copied." : "Copy unavailable."}
                        </span>
                      )}
                    </div>
                  </div>
                  <pre className="agent-studio-pack-pre mono">
                    <code>{renderAgentPackMarkdown(agent)}</code>
                  </pre>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="agent-studio-footer">
        <span className="muted small">
          {enabledCount} of {agents.length} specialists enabled
        </span>
        <button type="button" className="btn small" onClick={handleReset}>
          Reset defaults
        </button>
      </div>
    </section>
  );
}
