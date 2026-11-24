import { useEffect, useMemo, useRef, useState } from "react";

import { useActionLock } from "../lib/scramLock.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { DataLane, WorkspaceProject } from "../api/types.js";
import { CAPTURE_LIMIT } from "./CaptureBox.js";
import { LanePicker } from "./LanePicker.js";
import { WORKFLOWS, WORKFLOW_DESCRIPTION, WORKFLOW_LABEL, type Workflow } from "../lib/workflow.js";
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
 * Capture uses resolved defaults, with repository and runtime overrides in one disclosure.
 */
export function NewWorkModal({ open, mode, onClose }: NewWorkModalProps) {
  // A SCRAM in force for the organization or this project stops new work being captured (section 6.6).
  const scramLock = useActionLock();
  const copy = MODE_COPY[mode];
  const activeProject = useActiveProject();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const qc = useQueryClient();

  const [initialDefaults] = useState(() => loadWorkDefaults(mode));
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [workflow, setWorkflow] = useState<Workflow | "">("");
  const [pinnedFields, setPinnedFields] = useState(false);

  const [objective, setObjective] = useState("");
  const [defaultsNotice, setDefaultsNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const prepareSeqRef = useRef(0);
  const modalSessionRef = useRef(0);
  const prevModeRef = useRef(mode);
  const prevOpenRef = useRef(false);
  const appliedProjectIdRef = useRef<string | null>(null);

  function invalidatePrepared() {
    prepareSeqRef.current += 1;
    setPendingPrepareSeq(null);
    setPreparedPath(null);
    setPreparedBranch(null);
  }

  function applyDefaults(defaults: WorkDefaults) {
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

  function applyProjectPreferences(preferences: WorkspaceProject, defaultRoot: string) {
    setProject(preferences.name);
    setRepo(preferences.repo);
    setRepoStrategy(preferences.repoStrategy);
    setWorkspaceRoot(preferences.workspaceRoot || defaultRoot);
    setLane(preferences.lane);
    setAuthor(laneRuntimeSelection(
      sanitizeRuntimeSelection(preferences.author, defaultAuthorSelection()), preferences.laneAgents?.drafting,
    ));
    setChecker(laneRuntimeSelection(
      sanitizeRuntimeSelection(preferences.checker, defaultCheckerSelection()), preferences.laneAgents?.["agent-check"],
    ));
  }

  // Load saved defaults whenever Engineering Mode toggles (skip redundant mount run).
  useEffect(() => {
    if (prevModeRef.current === mode) return;
    prevModeRef.current = mode;
    appliedProjectIdRef.current = null;
    applyDefaults(loadWorkDefaults(mode));
    setSettingsOpen(false);
    setError(null);
    setDefaultsNotice(null);
  }, [mode]);

  // Apply active project defaults (name, bound repo, outfall strategy, lane, author/checker) on open or active project switch,
  // and reset back to global defaults when leaving a project for "All Software".
  useEffect(() => {
    const wasOpen = prevOpenRef.current;
    prevOpenRef.current = open;
    if (!open) return;
    const activeProjectId = activeProject?.id ?? null;
    if (wasOpen && activeProjectId === appliedProjectIdRef.current) return;
    const defaults = loadWorkDefaults(mode);
    if (activeProject && activeProject.mode === mode) {
      applyProjectPreferences(activeProject, defaults.workspaceRoot);
      invalidatePrepared();
      appliedProjectIdRef.current = activeProject.id;
    } else if (!activeProject && appliedProjectIdRef.current !== null) {
      applyDefaults(defaults);
      appliedProjectIdRef.current = null;
    }
  }, [open, activeProject, mode]);

  const trimmedWorkspaceRoot = workspaceRoot.trim();
  const reposQuery = useQuery({
    queryKey: ["repos", trimmedWorkspaceRoot],
    queryFn: () => api.repos(trimmedWorkspaceRoot || undefined),
    enabled: open && (settingsOpen || Boolean(repo)),
  });
  const runtimesQuery = useQuery({
    queryKey: ["runtimes"],
    queryFn: api.runtimes,
    enabled: open && settingsOpen,
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
  const captureBranch = preparedBranch ?? effectiveBranch;
  const repoIsListed = reposQuery.data?.local.some((r) => r.name === repo) ||
    reposQuery.data?.github.some((r) => r.name_with_owner === repo);
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
        objectiveRef.current?.focus();
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
      setSettingsOpen(false);
    }
  }, [open]);

  const send = useMutation({
    mutationFn: ({ body, lane: submittedLane }: { body: string; lane: DataLane; session: number }) =>
      api.capture({ text: body, source: "web", lane: submittedLane }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["captures"] });
      if (vars.session !== modalSessionRef.current) return;
      setObjective("");
      setWorkflow("");
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
      detailLevel: "simple",
      workspaceRoot: activeWorkspaceRoot,
      repo,
      repoStrategy,
    });
    setDefaultsNotice(`Saved defaults for ${copy.label} mode.`);
  }

  function handleResetDefaults() {
    const defaults = resetWorkDefaults(mode);
    applyDefaults(defaults);
    if (activeProject?.mode === mode) applyProjectPreferences(activeProject, defaults.workspaceRoot);
    setDefaultsNotice(`Reset ${copy.label} defaults.`);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pendingCaptureSession !== null || scramLock.locked) return;
    const trimmed = objective.trim();
    if (!trimmed) {
      setError("Enter an objective or scope before capturing.");
      objectiveRef.current?.focus();
      return;
    }
    // Header values sit inside [key:value] tags, so a bracket in any value would end its tag early
    // and could smuggle in another (the API reads only top-level tags). Every free value is checked:
    // what the person typed, the clone's folder name, the branch and the prepared path.
    const bracketed = (v: string | null | undefined) => !!v && /[[\]]/.test(v);
    const refused = bracketed(project)
      ? "A project name can't contain [ or ]."
      : repo && bracketed(repo)
        ? "This repository's name contains [ or ], which a request can't carry. Rename the folder or pick another."
        : repo && bracketed(captureBranch)
          ? "A branch name can't contain [ or ]."
          : bracketed(preparedPath)
            ? "This workspace's path contains [ or ], which a request can't carry. Prepare it in a folder without brackets."
            : null;
    if (refused) {
      setError(refused);
      return;
    }
    const header = [
      `[mode:${mode}]`,
      projectCaptureTag(project, activeProject),
      repo ? `[repo:${repo}]` : null,
      repo ? `[branch:${captureBranch}]` : null,
      repo ? `[outfall:${repoStrategy}]` : null,
      preparedPath ? `[workspace:${preparedPath}]` : null,
      workflow ? `[workflow:${workflow}]` : null,
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
          <h2 id="new-work-title" className="cr-modal-title">{copy.modalTitle}</h2>
          <p className="small muted" style={{ margin: 0 }}>Capture work for intake.</p>
        </div>
        <button type="button" className="btn small" onClick={onClose}>Esc</button>
      </div>

      <form className="cr-modal-body" onSubmit={submit}>
        <label className="field">
          <span>{copy.objectiveLabel}</span>
          <textarea
            ref={objectiveRef}
            rows={3}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder={copy.objectivePlaceholder}
          />
        </label>

        <LanePicker id="new-work-lane" value={lane} onChange={setLane} />
        <section aria-label="Capture defaults" className="cr-defaults-bar small">
          <div style={{ overflowWrap: "anywhere" }}>
            <strong>{project.trim() || "No project"}</strong>
            {repo ? <>{" · "}{repo} · <span className="mono">{captureBranch}</span></> : " · No repository"}
          </div>
          <div className="cr-defaults-summary muted">
            <span>Author · {ecosystemById(author.ecosystem).label} · {author.model === "default" ? "CLI default" : author.model}</span>
            <span>Checker · {ecosystemById(checker.ecosystem).label} · {checker.model === "default" ? "CLI default" : checker.model}</span>
          </div>
          {grade === "safety" && <span className="cr-warn-text">{copy.specialGrade.label}</span>}
          {inferred.reason && !pinnedFields && (
            <span className="ok">Auto-matched: {inferred.reason}</span>
          )}
          {preparedPath && (
            <span className="mono ok" role="status" style={{ overflowWrap: "anywhere" }}>
              Local checkout prepared: {preparedPath}
            </span>
          )}
          {isPreparing && !settingsOpen && <span role="status">Preparing local workspace…</span>}
          {!independent && (
            <p className="cr-warn-text" role="status" style={{ margin: 0 }}>
              O6 Notice: Author and Checker share the {ecosystemById(author.ecosystem).cliCommand} CLI.
              Independent runtime or owner override required before acceptance.
            </p>
          )}
        </section>

        <div>
          <button
            type="button"
            className="btn small"
            aria-expanded={settingsOpen}
            aria-controls="new-work-settings"
            onClick={() => setSettingsOpen((previous) => !previous)}
          >
            Capture settings
          </button>
        </div>
        <div id="new-work-settings" hidden={!settingsOpen}>
          {settingsOpen && (
            <div style={{ display: "grid", gap: 12 }}>
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
                      {repo && !repoIsListed && <option value={repo}>{repo} (saved preference)</option>}
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
                  </div>
                )}
                {repo && (
                  <p className="small muted" style={{ margin: "8px 0 0" }}>
                    Prepare a local checkout for manual use; agent runs still use an isolated package workspace until Cycle 2 repo binding lands.
                  </p>
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
                <div className="field">
                  <label htmlFor="new-work-workflow"><span>Workflow</span></label>
                  <select id="new-work-workflow" value={workflow} onChange={(e) => setWorkflow(e.target.value as Workflow | "")} aria-describedby="new-work-workflow-help">
                    <option value="">Project default</option>
                    {WORKFLOWS.map((w) => (
                      <option key={w} value={w}>
                        {WORKFLOW_LABEL[w]}
                      </option>
                    ))}
                  </select>
                  <span id="new-work-workflow-help" className="small muted">
                    {workflow ? WORKFLOW_DESCRIPTION[workflow] : "The project's workflow, else Playbook."}
                  </span>
                </div>
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

              <fieldset className="cr-custody-fieldset">
                <legend className="small">Agent custody</legend>
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
                {independent && (
                  <p className="small muted" style={{ margin: "8px 0 0" }}>
                    Distinct ecosystems (baselines checked at run time).
                  </p>
                )}
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
            </div>
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
          <button type="submit" className="btn primary" disabled={isCapturing || scramLock.locked} title={scramLock.why}>
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
