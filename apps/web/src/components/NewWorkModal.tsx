import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { DataLane } from "../api/types.js";
import { LanePicker } from "./LanePicker.js";
import { MODE_COPY, type EngineeringMode } from "../lib/mode.js";
import {
  CLI_ECOSYSTEMS,
  ecosystemById,
  isIndependentCustody,
  reasoningLevelsFor,
  resolveReasoningForModel,
  type AgentRuntimeSelection,
  type CliEcosystemId,
  type ReasoningLevel,
} from "../lib/runtimes.js";
import {
  inferScopeHints,
  loadWorkDefaults,
  resetWorkDefaults,
  saveWorkDefaults,
  type ModalDetailLevel,
  type RepoOutfallStrategy,
} from "../lib/workDefaults.js";

function suggestBranchName(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return slug ? `cr/${slug}` : "cr/work-package";
}

interface NewWorkModalProps {
  open: boolean;
  mode: EngineeringMode;
  onClose: () => void;
}

/**
 * Mode-aware creation modal ("New change" in Software Mode, "New deliverable" in Capital Projects Mode).
 * Supports Simple vs. Advanced detail levels, saveable per-mode defaults, scope-based auto-inference,
 * independent Author/Checker CLI+model+reasoning selection, and 4-choice clarifying questions.
 */
export function NewWorkModal({ open, mode, onClose }: NewWorkModalProps) {
  const copy = MODE_COPY[mode];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();

  const initialDefaults = loadWorkDefaults(mode);
  const [detailLevel, setDetailLevel] = useState<ModalDetailLevel>(initialDefaults.detailLevel);
  const [project, setProject] = useState(initialDefaults.project);
  const [stage, setStage] = useState(initialDefaults.stage);
  const [purpose, setPurpose] = useState(initialDefaults.purpose);
  const [discipline, setDiscipline] = useState(initialDefaults.discipline);
  const [lane, setLane] = useState<DataLane>(initialDefaults.lane);
  const [grade, setGrade] = useState<"general-service" | "safety">(initialDefaults.grade);
  const [author, setAuthor] = useState<AgentRuntimeSelection>(initialDefaults.author);
  const [checker, setChecker] = useState<AgentRuntimeSelection>(initialDefaults.checker);
  const [workspaceRoot, setWorkspaceRoot] = useState(initialDefaults.workspaceRoot);
  const [repo, setRepo] = useState(initialDefaults.repo);
  const [repoStrategy, setRepoStrategy] = useState<RepoOutfallStrategy>(initialDefaults.repoStrategy);
  const [branch, setBranch] = useState("");
  const [preparedPath, setPreparedPath] = useState<string | null>(null);
  const [pinnedFields, setPinnedFields] = useState(false);

  const [objective, setObjective] = useState("");
  const [defaultsNotice, setDefaultsNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load saved defaults whenever Engineering Mode toggles.
  useEffect(() => {
    const saved = loadWorkDefaults(mode);
    setDetailLevel(saved.detailLevel);
    setProject(saved.project);
    setStage(saved.stage);
    setPurpose(saved.purpose);
    setDiscipline(saved.discipline);
    setLane(saved.lane);
    setGrade(saved.grade);
    setAuthor(saved.author);
    setChecker(saved.checker);
    setWorkspaceRoot(saved.workspaceRoot);
    setRepo(saved.repo);
    setRepoStrategy(saved.repoStrategy);
    setPreparedPath(null);
    setPinnedFields(false);
    setDefaultsNotice(null);
  }, [mode]);

  const reposQuery = useQuery({
    queryKey: ["repos", workspaceRoot],
    queryFn: () => api.repos(workspaceRoot || undefined),
    enabled: open,
  });

  const activeWorkspaceRoot = workspaceRoot || reposQuery.data?.workspace_root || "";
  const effectiveBranch = branch.trim() || suggestBranchName(objective);

  const materialize = useMutation({
    mutationFn: () =>
      api.materializeRepo({
        repo,
        branch: effectiveBranch,
        strategy: repoStrategy,
        ...(activeWorkspaceRoot ? { workspace_root: activeWorkspaceRoot } : {}),
      }),
    onSuccess: (res) => {
      setPreparedPath(res.local_path);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["repos"] });
    },
    onError: (e) => setError(explain(e, "Could not prepare local workspace.")),
  });

  // Auto-infer discipline, stage, purpose, and grade from scope text unless user pinned manually.
  const inferred = useMemo(() => inferScopeHints(mode, objective), [mode, objective]);
  useEffect(() => {
    if (pinnedFields || !inferred.reason) return;
    if (inferred.discipline) setDiscipline(inferred.discipline);
    if (inferred.stage) setStage(inferred.stage);
    if (inferred.purpose) setPurpose(inferred.purpose);
    if (inferred.grade) setGrade(inferred.grade);
  }, [inferred, pinnedFields]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  const send = useMutation({
    mutationFn: (body: string) => api.capture({ text: body, source: "web", lane }),
    onSuccess: () => {
      setObjective("");
      setPinnedFields(false);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["captures"] });
      onClose();
    },
    onError: (e) => setError(explain(e, "Could not capture work.")),
  });

  function updateRuntime(
    setter: React.Dispatch<React.SetStateAction<AgentRuntimeSelection>>,
    ecosystemId: CliEcosystemId,
  ) {
    const eco = ecosystemById(ecosystemId);
    setter({
      ecosystem: eco.id,
      model: eco.defaultModel,
      reasoning: eco.defaultReasoning,
    });
  }

  function handleSaveDefaults() {
    saveWorkDefaults(mode, {
      project,
      stage,
      purpose,
      discipline,
      lane,
      grade,
      author,
      checker,
      detailLevel,
      workspaceRoot: activeWorkspaceRoot,
      repo,
      repoStrategy,
    });
    setDefaultsNotice(`Saved defaults for ${copy.label} mode.`);
  }

  function handleResetDefaults() {
    const base = resetWorkDefaults(mode);
    setProject(base.project);
    setStage(base.stage);
    setPurpose(base.purpose);
    setDiscipline(base.discipline);
    setLane(base.lane);
    setGrade(base.grade);
    setAuthor(base.author);
    setChecker(base.checker);
    setWorkspaceRoot(base.workspaceRoot);
    setRepo(base.repo);
    setRepoStrategy(base.repoStrategy);
    setPreparedPath(null);
    setPinnedFields(false);
    setDefaultsNotice(`Reset ${copy.label} defaults.`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = objective.trim();
    if (!trimmed) {
      setError("Enter an objective or scope before capturing.");
      return;
    }
    const header = [
      `[mode:${mode}]`,
      project.trim() ? `[project:${project.trim()}]` : null,
      repo ? `[repo:${repo}]` : null,
      repo ? `[branch:${effectiveBranch}]` : null,
      repo ? `[outfall:${repoStrategy}]` : null,
      preparedPath ? `[workspace:${preparedPath}]` : null,
      `[stage:${stage}]`,
      `[purpose:${purpose}]`,
      discipline && discipline !== "Unspecified" ? `[discipline:${discipline}]` : null,
      `[grade:${grade}]`,
      `[author:${author.ecosystem}/${author.model}@${author.reasoning}]`,
      `[checker:${checker.ecosystem}/${checker.model}@${checker.reasoning}]`,
    ]
      .filter(Boolean)
      .join(" ");

    const body = `${header}\n\n${trimmed}`;

    send.mutate(body);
  }

  const independent = isIndependentCustody(author, checker);

  return (
    <dialog
      ref={dialogRef}
      className="cr-modal"
      aria-labelledby="new-work-title"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="cr-modal-head">
        <div>
          <h2 id="new-work-title" className="cr-modal-title">
            {copy.modalTitle}
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            {copy.label} mode · Start brief and expand with defaults or 4-choice clarifications.
          </p>
        </div>
        <div className="cr-modal-head-actions">
          <div className="seg" role="group" aria-label="Form detail level">
            <button
              type="button"
              className={detailLevel === "simple" ? "active" : ""}
              aria-pressed={detailLevel === "simple"}
              onClick={() => setDetailLevel("simple")}
            >
              Simple
            </button>
            <button
              type="button"
              className={detailLevel === "advanced" ? "active" : ""}
              aria-pressed={detailLevel === "advanced"}
              onClick={() => setDetailLevel("advanced")}
            >
              Advanced
            </button>
          </div>
          <button type="button" className="btn small" onClick={onClose}>
            Esc
          </button>
        </div>
      </div>

      <form className="cr-modal-body" onSubmit={submit}>
        <label className="field">
          <span>{copy.objectiveLabel}</span>
          <textarea
            rows={detailLevel === "simple" ? 3 : 4}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder={copy.objectivePlaceholder}
          />
        </label>

        <div className="cr-defaults-bar">
          <div className="cr-defaults-summary">
            {discipline !== "Unspecified" && <span className="tag">{discipline}</span>}
            <span className="tag">{stage}</span>
            <span className="tag">{purpose}</span>
            <span className="tag">Lane: {lane}</span>
            <span className="tag">{grade === "safety" ? copy.specialGrade.label : "General service"}</span>
            {repo && <span className="tag">{repo} ({repoStrategy})</span>}
            <span className="mono small muted">
              {author.ecosystem}/{author.model}@{author.reasoning} → {checker.ecosystem}/{checker.model}@{checker.reasoning}
            </span>
          </div>
          {inferred.reason && !pinnedFields && (
            <span className="small ok">Auto-matched: {inferred.reason}</span>
          )}
        </div>

        <fieldset className="cr-custody-fieldset">
          <legend className="small">Repository &amp; Local Workspace</legend>
          <div className="cr-form-grid">
            <label className="field">
              <span>Repository (GitHub or Local)</span>
              <select
                aria-label="Repository"
                value={repo}
                onChange={(e) => {
                  setRepo(e.target.value);
                  setPreparedPath(null);
                }}
              >
                <option value="">No repository (general capture)</option>
                {(reposQuery.data?.local ?? []).length > 0 && (
                  <optgroup label={`Local clones (${activeWorkspaceRoot || "projects"})`}>
                    {reposQuery.data!.local.map((r) => (
                      <option key={`local-${r.name}`} value={r.name}>
                        {r.name} ({r.branch}{r.dirty ? " · dirty" : ""})
                      </option>
                    ))}
                  </optgroup>
                )}
                {(reposQuery.data?.github ?? []).length > 0 && (
                  <optgroup label="GitHub repositories">
                    {reposQuery.data!.github.map((g) => (
                      <option key={`gh-${g.name_with_owner}`} value={g.name_with_owner}>
                        {g.name_with_owner} ({g.default_branch}{g.is_private ? " · private" : ""})
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </label>
            {repo && (
              <label className="field">
                <span>Outfall strategy</span>
                <select
                  aria-label="Outfall strategy"
                  value={repoStrategy}
                  onChange={(e) => {
                    setRepoStrategy(e.target.value as RepoOutfallStrategy);
                    setPreparedPath(null);
                  }}
                >
                  <option value="worktree">New git worktree (Recommended)</option>
                  <option value="fresh-clone">Fresh local clone</option>
                  <option value="branch">New branch in local clone</option>
                </select>
              </label>
            )}
          </div>
          {detailLevel === "advanced" && (
            <div className="cr-form-grid" style={{ marginTop: 8 }}>
              <label className="field">
                <span>Default working location</span>
                <input
                  type="text"
                  value={workspaceRoot}
                  onChange={(e) => setWorkspaceRoot(e.target.value)}
                  placeholder={reposQuery.data?.workspace_root || "~/projects"}
                />
              </label>
              {repo && (
                <label className="field">
                  <span>Branch name</span>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    placeholder={suggestBranchName(objective)}
                  />
                </label>
              )}
            </div>
          )}
          {repo && (
            <div className="cr-clarify-bar" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn small"
                disabled={materialize.isPending}
                onClick={() => materialize.mutate()}
              >
                {materialize.isPending ? "Preparing workspace…" : "Prepare local workspace"}
              </button>
              {preparedPath && (
                <span className="mono small ok" role="status">
                  Ready: {preparedPath}
                </span>
              )}
            </div>
          )}
        </fieldset>

        <div className="cr-form-grid">
          <label className="field">
            <span>Discipline / Area</span>
            <select
              value={discipline}
              onChange={(e) => {
                setPinnedFields(true);
                setDiscipline(e.target.value);
              }}
            >
              {copy.disciplines.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{mode === "capital-projects" ? "Project Stage / Gate" : "Change Type"}</span>
            <select
              value={stage}
              onChange={(e) => {
                setPinnedFields(true);
                setStage(e.target.value);
              }}
            >
              {copy.projectStages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="cr-form-row-inline">
          <LanePicker id="new-work-lane" value={lane} onChange={setLane} />
          <label className="field" style={{ marginBottom: 0 }}>
            <span>Grade</span>
            <select
              value={grade}
              onChange={(e) => {
                setPinnedFields(true);
                setGrade(e.target.value as "general-service" | "safety");
              }}
            >
              <option value="general-service">General service</option>
              <option value={copy.specialGrade.value}>{copy.specialGrade.label}</option>
            </select>
          </label>
        </div>

        {detailLevel === "advanced" && (
          <>
            <div className="cr-form-grid">
              <label className="field">
                <span>Project / Workstream</span>
                <input
                  type="text"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder={copy.projectPlaceholder}
                />
              </label>
              <label className="field">
                <span>{mode === "capital-projects" ? "Issue Purpose" : "Review Target"}</span>
                <select
                  value={purpose}
                  onChange={(e) => {
                    setPinnedFields(true);
                    setPurpose(e.target.value);
                  }}
                >
                  {copy.issuePurposes.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="cr-custody-fieldset">
              <legend className="small">Agent Custody &amp; CLI Ecosystem</legend>
              <div className="cr-runtime-grid">
                <RuntimePickerCard
                  title={copy.custodyRoles[0]}
                  idPrefix="author"
                  value={author}
                  onChangeEcosystem={(id) => updateRuntime(setAuthor, id)}
                  onChangeModel={(m) =>
                    setAuthor((prev) => ({
                      ...prev,
                      model: m,
                      reasoning: resolveReasoningForModel(prev.ecosystem, m, prev.reasoning),
                    }))
                  }
                  onChangeReasoning={(r) => setAuthor((prev) => ({ ...prev, reasoning: r }))}
                />
                <RuntimePickerCard
                  title={copy.custodyRoles[1]}
                  idPrefix="checker"
                  value={checker}
                  onChangeEcosystem={(id) => updateRuntime(setChecker, id)}
                  onChangeModel={(m) =>
                    setChecker((prev) => ({
                      ...prev,
                      model: m,
                      reasoning: resolveReasoningForModel(prev.ecosystem, m, prev.reasoning),
                    }))
                  }
                  onChangeReasoning={(r) => setChecker((prev) => ({ ...prev, reasoning: r }))}
                />
              </div>
              <p
                className={independent ? "small ok" : "small cr-warn-text"}
                role="status"
                style={{ margin: "8px 0 0" }}
              >
                {independent
                  ? `O6 Custody OK: ${ecosystemById(author.ecosystem).cliCommand} prepares, independent ${ecosystemById(checker.ecosystem).cliCommand} verifies.`
                  : `O6 Notice: Author and Checker share the ${ecosystemById(author.ecosystem).cliCommand} CLI — independent runtime or owner override required before acceptance.`}
              </p>
            </fieldset>

            <div className="cr-clarify-bar">
              <span className="small muted">Defaults are saved per mode in this browser.</span>
              <div className="cr-defaults-actions">
                <button type="button" className="btn small" onClick={handleSaveDefaults}>
                  Save as my defaults
                </button>
                <button type="button" className="btn small" onClick={handleResetDefaults}>
                  Reset
                </button>
              </div>
            </div>
          </>
        )}

        {defaultsNotice && (
          <p className="small ok" role="status" style={{ margin: 0 }}>
            {defaultsNotice}
          </p>
        )}

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <div className="cr-modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={send.isPending}>
            {send.isPending ? "Capturing…" : `Capture ${copy.shortLabel === "Software" ? "change" : "deliverable"}`}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function RuntimePickerCard({
  title,
  idPrefix,
  value,
  onChangeEcosystem,
  onChangeModel,
  onChangeReasoning,
}: {
  title: string;
  idPrefix: string;
  value: AgentRuntimeSelection;
  onChangeEcosystem: (id: CliEcosystemId) => void;
  onChangeModel: (model: string) => void;
  onChangeReasoning: (reasoning: ReasoningLevel) => void;
}) {
  const eco = ecosystemById(value.ecosystem);
  const reasoningLevels = reasoningLevelsFor(value.ecosystem, value.model);
  return (
    <div className="cr-runtime-card">
      <div className="cr-runtime-title">{title}</div>
      <label className="field">
        <span>CLI Ecosystem</span>
        <select
          id={`${idPrefix}-cli`}
          value={value.ecosystem}
          onChange={(e) => onChangeEcosystem(e.target.value as CliEcosystemId)}
        >
          {CLI_ECOSYSTEMS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label} ({c.cliCommand})
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Model</span>
        <select
          id={`${idPrefix}-model`}
          value={value.model}
          onChange={(e) => onChangeModel(e.target.value)}
        >
          {eco.models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <div className="field" style={{ marginBottom: 0 }}>
        <span>Reasoning effort</span>
        <div className="cr-reason-group" role="group" aria-label={`${title} reasoning level`}>
          {reasoningLevels.map((r) => (
            <button
              key={r}
              type="button"
              className="cr-reason-btn"
              aria-pressed={value.reasoning === r}
              onClick={() => onChangeReasoning(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
