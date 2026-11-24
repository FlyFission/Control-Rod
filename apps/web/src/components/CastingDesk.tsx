import { useEffect, useMemo, useState } from "react";
import {
  CASTING_MODELS,
  CASTING_PRESETS,
  CASTING_ROLES,
  EFFORT_LEVELS,
  addAuthorFallback,
  createDraftFromPreset,
  formatCastingReadback,
  isLocalChecker,
  isSameVendorChecker,
  loadCastingDraft,
  modelById,
  moveAuthorFallback,
  removeAuthorFallback,
  saveCastingDraft,
  updateRoleAssignment,
  type CastingModelOption,
  type CastingPresetId,
  type CastingRoleId,
  type CastingSheetDraft,
  type EffortLevel,
} from "../lib/casting.js";
import "./casting-desk.css";

function groupModelsByVendor(models: readonly CastingModelOption[]): [string, CastingModelOption[]][] {
  const groups = new Map<string, CastingModelOption[]>();
  for (const model of models) {
    const existing = groups.get(model.vendor);
    if (existing) {
      existing.push(model);
    } else {
      groups.set(model.vendor, [model]);
    }
  }
  return [...groups.entries()];
}

export interface CastingDeskProps {
  draft?: CastingSheetDraft;
  onDraftChange?: (next: CastingSheetDraft) => void;
}

/**
 * Visual Casting Desk (ADR 0023 Role Casting, ADR 0024 Council First).
 *
 * Simple by default: one-click presets, four role cards with model and effort controls,
 * and a live plain-language read-back. Author-only fallback chains sit behind a collapsed
 * Advanced disclosure; Blind Checkers never fail over.
 */
export function CastingDesk({ draft: controlledDraft, onDraftChange }: CastingDeskProps = {}) {
  const [internalDraft, setInternalDraft] = useState<CastingSheetDraft>(() => loadCastingDraft());
  const draft = controlledDraft ?? internalDraft;
  const [lastPresetId, setLastPresetId] = useState<CastingPresetId>(() =>
    draft.presetId === "custom" ? "balanced" : draft.presetId,
  );

  useEffect(() => {
    if (controlledDraft === undefined) {
      saveCastingDraft(internalDraft);
    }
  }, [controlledDraft, internalDraft]);

  const setDraft = (updater: CastingSheetDraft | ((prev: CastingSheetDraft) => CastingSheetDraft)) => {
    if (controlledDraft !== undefined) {
      const next = typeof updater === "function" ? updater(controlledDraft) : updater;
      onDraftChange?.(next);
      return;
    }
    setInternalDraft(updater);
  };

  const vendorGroups = useMemo(() => groupModelsByVendor(CASTING_MODELS), []);

  const availableFallbacks = useMemo(() => {
    const blocked = new Set<string>([draft.roles.author.modelId, ...draft.authorFallbacks]);
    return CASTING_MODELS.filter((m) => !blocked.has(m.id));
  }, [draft.roles.author.modelId, draft.authorFallbacks]);

  const [selectedFallback, setSelectedFallback] = useState<string>("");
  const effectiveFallbackChoice =
    selectedFallback && availableFallbacks.some((m) => m.id === selectedFallback)
      ? selectedFallback
      : (availableFallbacks[0]?.id ?? "");

  const applyPreset = (presetId: CastingPresetId) => {
    setLastPresetId(presetId);
    setDraft(createDraftFromPreset(presetId));
  };

  const handleModelChange = (roleId: CastingRoleId, modelId: string) => {
    setDraft((prev) => updateRoleAssignment(prev, roleId, { modelId }));
  };

  const handleEffortChange = (roleId: CastingRoleId, effort: EffortLevel) => {
    setDraft((prev) => updateRoleAssignment(prev, roleId, { effort }));
  };

  const handleAddFallback = () => {
    if (!effectiveFallbackChoice) return;
    setDraft((prev) => addAuthorFallback(prev, effectiveFallbackChoice));
  };

  const authorModel = modelById(draft.roles.author.modelId);
  const checkerModel = modelById(draft.roles.checker.modelId);
  const sameVendor = isSameVendorChecker(draft);
  const localChecker = isLocalChecker(draft);
  const readback = formatCastingReadback(draft);

  return (
    <section className="panel casting-desk" aria-labelledby="casting-desk-title">
      <div className="panel-head">
        <h2 id="casting-desk-title">Casting desk</h2>
        <span className="tag">Local draft preview</span>
      </div>
      <p className="casting-intro small">
        Pick a preset or assign models and reasoning effort per role. Control Rod separates who writes the work from who
        checks it blindly.
      </p>
      <p className="casting-draft-notice small">
        <strong>Local draft preview</strong> — saved in this browser only. Applying a Casting Sheet to live runs
        requires API persistence and passkey signing (ADR 0023), which is not wired yet. No API keys or tokens are
        stored here.
      </p>

      <div className="casting-presets" role="group" aria-label="Casting presets">
        {CASTING_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="casting-preset-btn"
            aria-pressed={draft.presetId === preset.id}
            onClick={() => applyPreset(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="casting-roles-grid">
        {CASTING_ROLES.map((role) => {
          const assignment = draft.roles[role.id];
          const model = modelById(assignment.modelId);
          const selectId = `casting-model-${role.id}`;
          return (
            <article key={role.id} className="casting-role-card" aria-labelledby={`casting-role-${role.id}`}>
              <div className="casting-role-head">
                <h3 id={`casting-role-${role.id}`} className="casting-role-title">
                  {role.label}
                </h3>
                <div className="casting-role-badges">
                  <span className="tag">{model.vendor}</span>
                  <span className="tag">{model.local ? "Local" : "Cloud"}</span>
                  <span className="muted small mono">{model.contextLabel}</span>
                </div>
              </div>
              <p className="casting-role-desc">{role.responsibility}</p>

              <div className="casting-field">
                <label className="casting-field-label" htmlFor={selectId}>
                  {role.label} model
                </label>
                <select
                  id={selectId}
                  className="casting-select"
                  value={assignment.modelId}
                  onChange={(e) => handleModelChange(role.id, e.target.value)}
                >
                  {vendorGroups.map(([vendor, models]) => (
                    <optgroup key={vendor} label={vendor}>
                      {models.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} — {option.contextLabel} ({option.local ? "Local" : "Cloud"})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div className="casting-field">
                <span className="casting-field-label">
                  Effort{model.supportsEffort ? "" : " (ignored by this local model)"}
                </span>
                <div className="casting-effort-group" role="group" aria-label={`${role.label} effort`}>
                  {EFFORT_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      type="button"
                      className="casting-effort-btn"
                      aria-pressed={assignment.effort === level.id}
                      onClick={() => handleEffortChange(role.id, level.id)}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {localChecker && (
        <p role="status" className="casting-warning">
          <strong>Local Blind Checker restriction:</strong> {checkerModel.label} runs locally. Local models cannot serve
          as deciding checkers on Safety or Material grades (ADR 0023). Choose a separate cloud vendor for Blind Checker
          on those grades, or limit this casting to Local-Only / Restricted lanes.
        </p>
      )}

      {sameVendor && (
        <p role="status" className="casting-warning">
          <strong>Cross-vendor independence warning:</strong> Author ({authorModel.label}) and Blind Checker (
          {checkerModel.label}) share the same vendor family ({authorModel.vendor}). Cross-vendor independence requires
          a different vendor for Blind Checker unless you sign an override.
        </p>
      )}

      <p className="readback-line casting-readback" aria-live="polite">
        {readback}
      </p>

      <details className="casting-advanced">
        <summary>Advanced: author fallback chain &amp; reset</summary>
        <div className="casting-advanced-body">
          <div>
            <h3 className="casting-role-title">Author fallback chain</h3>
            <p className="casting-role-desc">
              Ordered failover for the Author seat only. If the primary author hits a quota limit or goes offline,
              Control Rod logs the switch and pauses for your review before merge.
            </p>
          </div>

          <ol className="casting-fallback-list" aria-label="Author fallback chain">
            <li className="casting-fallback-item">
              <div className="casting-fallback-meta">
                <span className="tag">Primary</span>
                <strong>{authorModel.label}</strong>
                <span className="muted small">{authorModel.vendor}</span>
              </div>
              <span className="muted small">Author seat</span>
            </li>
            {draft.authorFallbacks.map((fallbackId, index) => {
              const fb = modelById(fallbackId);
              return (
                <li key={fallbackId} className="casting-fallback-item">
                  <div className="casting-fallback-meta">
                    <span className="tag">Fallback {index + 1}</span>
                    <strong>{fb.label}</strong>
                    <span className="muted small">{fb.vendor}</span>
                  </div>
                  <div className="casting-fallback-actions">
                    <button
                      type="button"
                      className="btn small"
                      aria-label={`Move ${fb.label} up`}
                      disabled={index === 0}
                      onClick={() => setDraft((prev) => moveAuthorFallback(prev, index, "up"))}
                    >
                      Move up
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      aria-label={`Move ${fb.label} down`}
                      disabled={index === draft.authorFallbacks.length - 1}
                      onClick={() => setDraft((prev) => moveAuthorFallback(prev, index, "down"))}
                    >
                      Move down
                    </button>
                    <button
                      type="button"
                      className="btn small"
                      aria-label={`Remove ${fb.label}`}
                      onClick={() => setDraft((prev) => removeAuthorFallback(prev, fallbackId))}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="casting-fallback-add">
            <select
              aria-label="Add author fallback model"
              className="casting-select"
              value={effectiveFallbackChoice}
              disabled={availableFallbacks.length === 0}
              onChange={(e) => setSelectedFallback(e.target.value)}
            >
              {availableFallbacks.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} ({option.vendor})
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn small"
              disabled={!effectiveFallbackChoice}
              onClick={handleAddFallback}
            >
              Add fallback
            </button>
          </div>

          <p className="casting-callout">
            <strong>Blind Checkers never fail over</strong> (ADR 0023 / ADR 0024 Decision 6): failover applies only to
            the Author seat so a checker cannot pass-shop across models.
          </p>

          <div className="casting-advanced-footer">
            <button type="button" className="btn small" onClick={() => applyPreset(lastPresetId)}>
              Reset to preset
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
