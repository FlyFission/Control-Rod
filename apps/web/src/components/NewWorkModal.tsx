import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { DataLane } from "../api/types.js";
import { CAPTURE_LIMIT } from "./CaptureBox.js";
import { LanePicker } from "./LanePicker.js";
import { MODE_COPY, type EngineeringMode } from "../lib/mode.js";
import { projectCaptureTag, useActiveProject } from "../lib/projects.js";
import {
  CLI_ECOSYSTEMS,
  defaultAuthorSelection,
  defaultCheckerSelection,
  ecosystemById,
  formatModelLabel,
  isIndependentCustody,
  laneRuntimeSelection,
  modelsForEcosystem,
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
  sanitizeRuntimeSelection,
  type ModalDetailLevel,
  type RepoOutfallStrategy,
  type WorkDefaults,
} from "../lib/workDefaults.js";

function suggestBranchName(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  return slug ? `cr/${slug}` : "cr/work-package";
}

const STRATEGY_NOTE: Record<RepoOutfallStrategy, string> = {
  worktree:
    "Selected strategy (worktree) prepares the local git checkout now; direct runtime & workspace binding to daemon runs lands in Cycle 2.",
  "fresh-clone":
    "Selected strategy (fresh-clone) prepares a fresh local git checkout now; direct runtime & workspace binding to daemon runs lands in Cycle 2.",
  branch:
    "Selected strategy (branch in base clone) prepares the local git checkout now; direct runtime & workspace binding to daemon runs lands in Cycle 2.",
};

interface PrepareSnapshot {
  seq: number;
  repo: string;
  repoStrategy: RepoOutfallStrategy;
  mode: EngineeringMode;
  workspaceRoot: string;
  targetWorkspaceRoot: string;
  branch: string;
}

type RuntimeSelectionPatch =
  | { ecosystem: CliEcosystemId }
  | { model: string }
  | { reasoning: ReasoningLevel };

interface NewWorkModalProps {
  open: boolean;
  mode: EngineeringMode;
  onClose: () => void;
}

/**
 * Mode-aware creation modal ("New change" in Software Mode, "New deliverable" in Capital Projects Mode).
 * Supports Simple vs. Advanced detail levels, saveable per-mode defaults, scope-based auto-inference,
 * and Author/Checker CLI+model+reasoning selection.
 */
export function NewWorkModal({ open, mode, onClose }: NewWorkModalProps) {
  const copy = MODE_COPY[mode];
  const activeProject = useActiveProject();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();

  const [initialDefaults] = useState(() => loadWorkDefaults(mode));
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
  const [preparedBranch, setPreparedBranch] = useState<string | null>(null);
  const [pendingPrepareSeq, setPendingPrepareSeq] = useState<number | null>(null);
  const [pendingCaptureSession, setPendingCaptureSession] = useState<number | null>(null);
  const [pinnedFields, setPinnedFields] = useState(false);

  const [objective, setObjective] = useState("");
  const [defaultsNotice, setDefaultsNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prepareSeqRef = useRef(0);
  const modalSessionRef = useRef(0);
  const prevModeRef = useRef(mode);

  function invalidatePrepared() {
    prepareSeqRef.current += 1;
    setPendingPrepareSeq(null);
    setPreparedPath(null);
    setPreparedBranch(null);
  }

  function applyDefaults(defaults: WorkDefaults, includeDetailLevel = false) {
    if (includeDetailLevel) {
      setDetailLevel(defaults.detailLevel);
    }
    setProject(defaults.project);
    setStage(defaults.stage);
    setPurpose(defaults.purpose);
    setDiscipline(defaults.discipline);
    setLane(defaults.lane);
    setGrade(defaults.grade);
    setAuthor(defaults.author);
    setChecker(defaults.checker);
    setWorkspaceRoot(defaults.workspaceRoot);
    setRepo(defaults.repo);
    setRepoStrategy(defaults.repoStrategy);
    setBranch("");
    invalidatePrepared();
    setPinnedFields(false);
  }

  // Load saved defaults whenever Engineering Mode toggles (skip redundant mount run).
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    applyDefaults(loadWorkDefaults(mode), true);
    setError(null);
    setDefaultsNotice(null);
  }, [mode]);

  // Apply active project defaults (name, bound repo, outfall strategy, lane, author/checker) whenever opened inside a project.
  useEffect(() => {
    if (!open || !activeProject) return;
    setProject(activeProject.name);
    setRepo(activeProject.repo);
    setRepoStrategy(activeProject.repoStrategy);
    if (activeProject.workspaceRoot) setWorkspaceRoot(activeProject.workspaceRoot);
    setLane(activeProject.lane);
    setAuthor(laneRuntimeSelection(sanitizeRuntimeSelection(activeProject.author, defaultAuthorSelection()), activeProject.laneAgents?.drafting));
    setChecker(laneRuntimeSelection(sanitizeRuntimeSelection(activeProject.checker, defaultCheckerSelection()), activeProject.laneAgents?.["agent-check"]));
    invalidatePrepared();
  }, [open, activeProject]);

  const trimmedWorkspaceRoot = workspaceRoot.trim();
  const reposQuery = useQuery({
    queryKey: ["repos", trimmedWorkspaceRoot],
    queryFn: () => api.repos(trimmedWorkspaceRoot || undefined),
    enabled: open,
  });
  const runtimesQuery = useQuery({
    queryKey: ["runtimes"],
    queryFn: api.runtimes,
    enabled: open,
  });
  const liveModelsByEco = useMemo(() => {
    const map: Partial<Record<CliEcosystemId, string[]>> = {};
    for (const r of runtimesQuery.data?.runtimes ?? []) {
      if (Array.isArray(r.models) && r.models.length > 0) {
        map[r.runtime as CliEcosystemId] = r.models;
      }
    }
    return map;
  }, [runtimesQuery.data]);

  const activeWorkspaceRoot = trimmedWorkspaceRoot || reposQuery.data?.workspace_root || "";
  const effectiveBranch = branch.trim() || suggestBranchName(objective);
  const latestPrepareInputsRef = useRef({
    repo,
    repoStrategy,
    mode,
    workspaceRoot: trimmedWorkspaceRoot,
  });
  latestPrepareInputsRef.current = {
    repo,
    repoStrategy,
    mode,
    workspaceRoot: trimmedWorkspaceRoot,
  };

  function isCurrentPrepare(snapshot: PrepareSnapshot): boolean {
    const current = latestPrepareInputsRef.current;
    return (
      snapshot.seq === prepareSeqRef.current &&
      current.repo === snapshot.repo &&
      current.repoStrategy === snapshot.repoStrategy &&
      current.mode === snapshot.mode &&
      current.workspaceRoot === snapshot.workspaceRoot
    );
  }

  const materialize = useMutation({
    mutationFn: async (snapshot: PrepareSnapshot) => {
      const res = await api.materializeRepo({
        repo: snapshot.repo,
        branch: snapshot.branch,
        strategy: snapshot.repoStrategy,
        mode: snapshot.mode === "capital-projects" ? "capital-projects" : "software",
        ...(snapshot.targetWorkspaceRoot ? { workspace_root: snapshot.targetWorkspaceRoot } : {}),
      });
      return { res, snapshot };
    },
    onSuccess: ({ res, snapshot }) => {
      if (!isCurrentPrepare(snapshot)) return;
      setPreparedPath(res.local_path);
      setPreparedBranch(res.branch || snapshot.branch);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["repos"] });
    },
    onError: (e, snapshot) => {
      if (!isCurrentPrepare(snapshot)) return;
      setError(explain(e, "Could not prepare local workspace."));
    },
    onSettled: (_data, _err, snapshot) => {
      if (snapshot.seq === prepareSeqRef.current) {
        setPendingPrepareSeq(null);
      }
    },
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
    if (dlg) {
      if (open && !dlg.open) {
        dlg.showModal();
      } else if (!open && dlg.open) {
        dlg.close();
      }
    }
    if (!open) {
      modalSessionRef.current += 1;
      setPendingCaptureSession(null);
      invalidatePrepared();
      setError(null);
      setDefaultsNotice(null);
    }
  }, [open]);

  const send = useMutation({
    mutationFn: ({ body, lane: submittedLane }: { body: string; lane: DataLane; session: number }) =>
      api.capture({ text: body, source: "web", lane: submittedLane }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["captures"] });
      if (vars.session !== modalSessionRef.current) return;
      setObjective("");
      setBranch("");
      invalidatePrepared();
      setPinnedFields(false);
      setDefaultsNotice(null);
      setError(null);
      onClose();
    },
    onError: (e, vars) => {
      if (vars.session !== modalSessionRef.current) return;
      setError(explain(e, "Could not capture work."));
    },
    onSettled: (_data, _err, vars) => {
      if (vars.session === modalSessionRef.current) {
        setPendingCaptureSession(null);
      }
    },
  });

  function updateRuntimeSelection(role: "author" | "checker", patch: RuntimeSelectionPatch) {
    const setter = role === "author" ? setAuthor : setChecker;
    setter((prev) => {
      if ("ecosystem" in patch) {
        const eco = ecosystemById(patch.ecosystem);
        if (!eco.runnable) return prev;
        return {
          ecosystem: eco.id,
          model: eco.defaultModel,
          reasoning: eco.defaultReasoning,
        };
      }
      if ("model" in patch) {
        return {
          ...prev,
          model: patch.model,
          reasoning: resolveReasoningForModel(prev.ecosystem, patch.model, prev.reasoning),
        };
      }
      return { ...prev, reasoning: patch.reasoning };
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
    applyDefaults(resetWorkDefaults(mode));
    setDefaultsNotice(`Reset ${copy.label} defaults.`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pendingCaptureSession !== null) return;
    const trimmed = objective.trim();
    if (!trimmed) {
      setError("Enter an objective or scope before capturing.");
      return;
    }
    const submittedBranch = preparedBranch ?? effectiveBranch;
    const header = [
      `[mode:${mode}]`,
      projectCaptureTag(project, activeProject),
      repo ? `[repo:${repo}]` : null,
      repo ? `[branch:${submittedBranch}]` : null,
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
    if (body.length > CAPTURE_LIMIT) {
      setError(
        `Too long for one capture (${body.length.toLocaleString()} of ${CAPTURE_LIMIT.toLocaleString()} characters, including metadata header). Shorten the objective or project name.`,
      );
      return;
    }
    const session = modalSessionRef.current;
    setPendingCaptureSession(session);
    send.mutate({ body, lane, session });
  }

  const independent = isIndependentCustody(author, checker);
  const isPreparing = pendingPrepareSeq !== null;
  const isCapturing = pendingCaptureSession !== null;

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
            {copy.label} mode · Start brief and expand with saved defaults or Advanced options.
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
                  invalidatePrepared();
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
                    invalidatePrepared();
                  }}
                >
                  <option value="worktree">New git worktree (Recommended)</option>
                  <option value="fresh-clone">Fresh local clone</option>
                  <option value="branch">New branch in local clone</option>
                </select>
              </label>
            )}
          </div>
          {reposQuery.isError && (
            <p role="alert" className="error" style={{ marginTop: 8, marginBottom: 0 }}>
              {explain(reposQuery.error, "Could not load repositories.")}
            </p>
          )}
          {reposQuery.data?.github_error && (
            <p role="alert" className="error" style={{ marginTop: 8, marginBottom: 0 }}>
              GitHub repositories unavailable: {reposQuery.data.github_error}
            </p>
          )}
          {detailLevel === "advanced" && (
            <div className="cr-form-grid" style={{ marginTop: 8 }}>
              <label className="field">
                <span>Default working location</span>
                <input
                  type="text"
                  value={workspaceRoot}
                  onChange={(e) => {
                    setWorkspaceRoot(e.target.value);
                    invalidatePrepared();
                  }}
                  placeholder={reposQuery.data?.workspace_root || "~/projects"}
                />
              </label>
              {repo && (
                <label className="field">
                  <span>Branch name</span>
                  <input
                    type="text"
                    value={branch}
                    onChange={(e) => {
                      setBranch(e.target.value);
                      invalidatePrepared();
                    }}
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
                disabled={isPreparing}
                onClick={() => {
                  const seq = ++prepareSeqRef.current;
                  setPendingPrepareSeq(seq);
                  setPreparedPath(null);
                  setPreparedBranch(null);
                  setError(null);
                  materialize.mutate({
                    seq,
                    repo,
                    repoStrategy,
                    mode,
                    workspaceRoot: trimmedWorkspaceRoot,
                    targetWorkspaceRoot: activeWorkspaceRoot,
                    branch: effectiveBranch,
                  });
                }}
              >
                {isPreparing ? "Preparing workspace…" : "Prepare local workspace"}
              </button>
              {preparedPath && (
                <span className="mono small ok" role="status">
                  Ready: {preparedPath}
                </span>
              )}
            </div>
          )}
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            {repo
              ? STRATEGY_NOTE[repoStrategy]
              : "Preparing a repository creates the local git checkout now; direct runtime & workspace binding to daemon runs lands in Cycle 2."}
          </p>
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
            <span>{mode === "capital-projects" ? "Project Stage / Gate" : mode === "nuclear-grade" ? "PRO Stage" : "Change Type"}</span>
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

        <fieldset className="cr-custody-fieldset">
          <legend className="small">Agent Custody &amp; CLI Ecosystem</legend>
          {detailLevel === "simple" ? (
            <>
              <div className="cr-form-grid">
                <label className="field">
                  <span>{copy.custodyRoles[0]}</span>
                  <select
                    id="author-cli-simple"
                    aria-label={copy.custodyRoles[0]}
                    value={author.ecosystem}
                    onChange={(e) => updateRuntimeSelection("author", { ecosystem: e.target.value as CliEcosystemId })}
                  >
                    {CLI_ECOSYSTEMS.map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.runnable}>
                        {c.label} ({c.cliCommand}){c.runnable ? "" : " — Not yet runnable"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{copy.custodyRoles[1]}</span>
                  <select
                    id="checker-cli-simple"
                    aria-label={copy.custodyRoles[1]}
                    value={checker.ecosystem}
                    onChange={(e) => updateRuntimeSelection("checker", { ecosystem: e.target.value as CliEcosystemId })}
                  >
                    {CLI_ECOSYSTEMS.map((c) => (
                      <option key={c.id} value={c.id} disabled={!c.runnable}>
                        {c.label} ({c.cliCommand}){c.runnable ? "" : " — Not yet runnable"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="small muted" style={{ margin: "6px 0 0" }}>
                Uses each CLI&apos;s latest default model ({formatModelLabel(author.model)} → {formatModelLabel(checker.model)}). Switch to Advanced to pick a specific model or reasoning effort.
              </p>
            </>
          ) : (
            <div className="cr-runtime-grid">
              <RuntimePickerCard
                title={copy.custodyRoles[0]}
                idPrefix="author"
                value={author}
                liveModels={liveModelsByEco[author.ecosystem]}
                onChange={(patch) => updateRuntimeSelection("author", patch)}
              />
              <RuntimePickerCard
                title={copy.custodyRoles[1]}
                idPrefix="checker"
                value={checker}
                liveModels={liveModelsByEco[checker.ecosystem]}
                onChange={(patch) => updateRuntimeSelection("checker", patch)}
              />
            </div>
          )}
          <p
            className={independent ? "small ok" : "small cr-warn-text"}
            role="status"
            style={{ margin: "8px 0 0" }}
          >
            {independent
              ? `Distinct ecosystems (baselines checked at run time): ${ecosystemById(author.ecosystem).cliCommand} prepares, ${ecosystemById(checker.ecosystem).cliCommand} verifies.`
              : `O6 Notice: Author and Checker share the ${ecosystemById(author.ecosystem).cliCommand} CLI — independent runtime or owner override required before acceptance.`}
          </p>
        </fieldset>

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
                <span>{mode === "capital-projects" ? "Issue Purpose" : mode === "nuclear-grade" ? "Packet Type" : "Review Target"}</span>
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
          <button type="submit" className="btn primary" disabled={isCapturing}>
            {isCapturing
              ? "Capturing…"
              : mode === "nuclear-grade"
                ? "Capture packet"
                : mode === "software"
                  ? "Capture change"
                  : "Capture deliverable"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

const CUSTOM_MODEL_OPTION = "__custom__";

function RuntimePickerCard({
  title,
  idPrefix,
  value,
  liveModels,
  onChange,
}: {
  title: string;
  idPrefix: string;
  value: AgentRuntimeSelection;
  liveModels?: readonly string[] | undefined;
  onChange: (patch: RuntimeSelectionPatch) => void;
}) {
  const models = modelsForEcosystem(value.ecosystem, liveModels);
  const isCustomModel = !models.includes(value.model);
  const [editingCustom, setEditingCustom] = useState(isCustomModel);
  useEffect(() => {
    if (!models.includes(value.model)) setEditingCustom(true);
  }, [value.ecosystem, value.model, models]);
  const reasoningLevels = reasoningLevelsFor(value.ecosystem, value.model);
  return (
    <div className="cr-runtime-card">
      <div className="cr-runtime-title">{title}</div>
      <label className="field">
        <span>CLI Ecosystem</span>
        <select
          id={`${idPrefix}-cli`}
          value={value.ecosystem}
          onChange={(e) => {
            setEditingCustom(false);
            onChange({ ecosystem: e.target.value as CliEcosystemId });
          }}
        >
          {CLI_ECOSYSTEMS.map((c) => (
            <option key={c.id} value={c.id} disabled={!c.runnable}>
              {c.label} ({c.cliCommand}){c.runnable ? "" : " — Not yet runnable"}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Model</span>
        <select
          id={`${idPrefix}-model`}
          value={editingCustom || isCustomModel ? CUSTOM_MODEL_OPTION : value.model}
          onChange={(e) => {
            if (e.target.value === CUSTOM_MODEL_OPTION) {
              setEditingCustom(true);
            } else {
              setEditingCustom(false);
              onChange({ model: e.target.value });
            }
          }}
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {formatModelLabel(m)}
            </option>
          ))}
          <option value={CUSTOM_MODEL_OPTION}>Custom model ID…</option>
        </select>
      </label>
      {(editingCustom || isCustomModel) && (
        <label className="field">
          <span>Custom model ID</span>
          <input
            type="text"
            id={`${idPrefix}-custom-model`}
            value={value.model === "default" ? "" : value.model}
            placeholder="e.g. claude-opus-4-6 or gpt-6.2-sol"
            onChange={(e) => onChange({ model: e.target.value.trim() || "default" })}
          />
        </label>
      )}
      <div className="field" style={{ marginBottom: 0 }}>
        <span>Reasoning effort</span>
        <div className="cr-reason-group" role="group" aria-label={`${title} reasoning level`}>
          {reasoningLevels.map((r) => (
            <button
              key={r}
              type="button"
              className="cr-reason-btn"
              aria-pressed={value.reasoning === r}
              onClick={() => onChange({ reasoning: r })}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
