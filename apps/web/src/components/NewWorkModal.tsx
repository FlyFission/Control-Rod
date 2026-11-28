import { useEffect, useMemo, useRef, useState } from "react";
import { CloseX } from "./CloseX.js";
import { backdropClose } from "../lib/dismiss.js";

import { suggestBranchName } from "../lib/branch.js";
import { useActionLock } from "../lib/scramLock.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, explain } from "../api/client.js";
import type { DataLane, NewCapture, WorkspaceProject } from "../api/types.js";
import { CAPTURE_LIMIT } from "./CaptureBox.js";
import { LanePicker } from "./LanePicker.js";
import { WORKFLOWS, WORKFLOW_DESCRIPTION, WORKFLOW_LABEL, type Workflow } from "../lib/workflow.js";
import { MODE_COPY, type EngineeringMode } from "../lib/mode.js";
import { projectCaptureTag, useActiveProject, useProjects } from "../lib/projects.js";
import {
  CHECKOUT_AUTHORS,
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
  bindableStrategy,
  inferScopeHints,
  loadWorkDefaults,
  resetWorkDefaults,
  saveWorkDefaults,
  sanitizeRuntimeSelection,
  type RepoOutfallStrategy,
  type WorkDefaults,
} from "../lib/workDefaults.js";


// Each card gets its own git worktree and branch. A fresh clone or a branch in the base clone can't
// be bound to a run yet (services/api/src/repos.ts bindCheckout), so neither is offered.
const STRATEGY_NOTE =
  "The change gets its own git worktree and branch. It is prepared when you add the change, or now with Prepare local workspace.";

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
  const copy = MODE_COPY[mode];
  const activeProject = useActiveProject();
  const allProjects = useProjects();
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
  // A card follows the agents picked at the top of each board column unless the person picks
  // agents for this one card under More settings; only then does the request carry its own.
  // Agents saved as defaults on purpose count as picked, so they reach the card too.
  const [agentsChosen, setAgentsChosen] = useState(initialDefaults.agentsChosen);
  const [workspaceRoot, setWorkspaceRoot] = useState(initialDefaults.workspaceRoot);
  const [repo, setRepo] = useState(initialDefaults.repo);
  const [repoStrategy, setRepoStrategy] = useState<RepoOutfallStrategy>(initialDefaults.repoStrategy);
  // Set while Add prepares the workspace itself, before the capture is sent.
  const [preparingOnSubmit, setPreparingOnSubmit] = useState(false);
  const [branch, setBranch] = useState("");
  const [preparedPath, setPreparedPath] = useState<string | null>(null);
  const [preparedBranch, setPreparedBranch] = useState<string | null>(null);
  const [pendingPrepareSeq, setPendingPrepareSeq] = useState<number | null>(null);
  const [pendingCaptureSession, setPendingCaptureSession] = useState<number | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | "">("");
  const [pinnedFields, setPinnedFields] = useState(false);
  // Lock on the project this capture will really target (the editable field), not the sidebar's.
  const targetProject = project.trim();
  const targetEntry = allProjects.find((p) => p.name.toLowerCase() === targetProject.toLowerCase());
  const scramLock = useActionLock(targetEntry ? targetEntry.id : targetProject || null);

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
    setAgentsChosen(defaults.agentsChosen);
    setBranch("");
    invalidatePrepared();
    setPinnedFields(false);
  }

  function applyProjectPreferences(preferences: WorkspaceProject, defaultRoot: string) {
    setProject(preferences.name);
    setRepo(preferences.repo);
    setRepoStrategy(bindableStrategy(preferences.repoStrategy));
    setWorkspaceRoot(preferences.workspaceRoot || defaultRoot);
    // The project's own agents are applied on the server; the card names agents only when picked here.
    setAgentsChosen({ author: false, checker: false });
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
      // A pick for one card ends with it; agents saved as defaults on purpose come back.
      const saved = loadWorkDefaults(mode);
      setAgentsChosen(saved.agentsChosen);
      if (saved.agentsChosen.author) setAuthor(saved.author);
      if (saved.agentsChosen.checker) setChecker(saved.checker);
    }
  }, [open]);

  const send = useMutation({
    mutationFn: ({ body, lane: submittedLane, checkout }: { body: string; lane: DataLane; session: number; checkout?: NewCapture["checkout"]; made?: { local_path: string; repo_path: string } }) =>
      api.capture({ text: body, source: "web", lane: submittedLane, ...(checkout ? { checkout } : {}) }),
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
      // A worktree Add made for this capture is removed only on a clear refusal: after a lost reply or
      // a server error the capture may have been saved, so the worktree stays.
      if (vars.made && e instanceof ApiError && e.status >= 400 && e.status < 500) {
        void api.removeRepo({ worktree_path: vars.made.local_path, repo_path: vars.made.repo_path, ...(vars.checkout?.workspace_root ? { workspace_root: vars.checkout.workspace_root } : {}) })
          .catch(() => undefined)
          .finally(() => void qc.invalidateQueries({ queryKey: ["repos"] }));
        if (vars.session === modalSessionRef.current) invalidatePrepared();
      }
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
    setAgentsChosen((prev) => ({ ...prev, [role]: true }));
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
      agentsChosen,
    });
    setDefaultsNotice(`Saved defaults for ${copy.label} mode.`);
  }

  function handleResetDefaults() {
    const defaults = resetWorkDefaults(mode);
    applyDefaults(defaults);
    if (activeProject?.mode === mode) applyProjectPreferences(activeProject, defaults.workspaceRoot);
    setDefaultsNotice(`Reset ${copy.label} defaults.`);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pendingCaptureSession !== null || pendingPrepareSeq !== null || scramLock.locked) return;
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
    const pathRefusal = "This workspace's path contains [ or ], which a request can't carry. Prepare it in a folder without brackets.";
    const refused = bracketed(project)
      ? "A project name can't contain [ or ]."
      : repo && bracketed(repo)
        ? "This repository's name contains [ or ], which a request can't carry. Rename the folder or pick another."
        : repo && bracketed(captureBranch)
          ? "A branch name can't contain [ or ]."
          : bracketed(preparedPath)
            ? pathRefusal
            : null;
    if (refused) {
      setError(refused);
      return;
    }
    const bodyFor = (cardBranch: string) => {
      const header = [
        `[mode:${mode}]`,
        projectCaptureTag(project, activeProject),
        repo ? `[repo:${repo}]` : null,
        repo ? `[branch:${cardBranch}]` : null,
        repo ? `[outfall:${repoStrategy}]` : null,
        workflow ? `[workflow:${workflow}]` : null,
        `[stage:${stage}]`,
        `[purpose:${purpose}]`,
        discipline && discipline !== "Unspecified" ? `[discipline:${discipline}]` : null,
        `[grade:${grade}]`,
        agentsChosen.author ? `[author:${author.ecosystem}/${author.model}@${author.reasoning}]` : null,
        agentsChosen.checker ? `[checker:${checker.ecosystem}/${checker.model}@${checker.reasoning}]` : null,
      ]
        .filter(Boolean)
        .join(" ");
      return `${header}\n\n${trimmed}`;
    };
    const tooLong = (body: string) =>
      body.length > CAPTURE_LIMIT
        ? `Too long for one capture (${body.length.toLocaleString()} of ${CAPTURE_LIMIT.toLocaleString()} characters, including metadata header). Shorten the objective or project name.`
        : null;
    const longError = tooLong(bodyFor(captureBranch));
    if (longError) {
      setError(longError);
      return;
    }
    // A repository always means a checkout: the work runs in it, so only an agent that can work in one may author.
    if (repo && !CHECKOUT_AUTHORS.includes(author.ecosystem)) {
      setError(`${ecosystemById(author.ecosystem).label} can't work in a repository checkout yet. Pick Claude Code or Codex as author.`);
      return;
    }
    const session = modalSessionRef.current;
    setPendingCaptureSession(session);
    setError(null);
    let path = preparedPath;
    let cardBranch = captureBranch;
    let made: { local_path: string; repo_path: string } | undefined;
    if (repo && !path) {
      // Add prepares the workspace itself, so a card with a repository is always bound to its checkout.
      setPreparingOnSubmit(true);
      try {
        const res = await api.materializeRepo({
          repo,
          branch: effectiveBranch,
          strategy: repoStrategy,
          mode: mode === "capital-projects" ? "capital-projects" : "software",
          ...(activeWorkspaceRoot ? { workspace_root: activeWorkspaceRoot } : {}),
        });
        path = res.local_path;
        cardBranch = res.branch || effectiveBranch;
        if (res.repo_path) made = { local_path: res.local_path, repo_path: res.repo_path };
        void qc.invalidateQueries({ queryKey: ["repos"] });
      } catch (err) {
        if (session === modalSessionRef.current) {
          setError(explain(err, "Could not prepare local workspace."));
          setPendingCaptureSession(null);
        }
        return;
      } finally {
        setPreparingOnSubmit(false);
      }
      if (session !== modalSessionRef.current) {
        // The box was closed while Add prepared, so no card will use this worktree.
        if (made) {
          void api.removeRepo({ worktree_path: made.local_path, repo_path: made.repo_path, ...(activeWorkspaceRoot ? { workspace_root: activeWorkspaceRoot } : {}) })
            .catch(() => undefined)
            .finally(() => void qc.invalidateQueries({ queryKey: ["repos"] }));
        }
        return;
      }
      setPreparedPath(path);
      setPreparedBranch(cardBranch);
    }
    const body = bodyFor(cardBranch);
    const late = bracketed(path) ? pathRefusal : tooLong(body);
    if (late) {
      setError(late);
      setPendingCaptureSession(null);
      return;
    }
    send.mutate({ body, lane, session, ...(made ? { made } : {}), ...(path ? { checkout: {
      repo, local_path: path, branch: cardBranch,
      ...(activeWorkspaceRoot ? { workspace_root: activeWorkspaceRoot } : {}),
    } } : {}) });
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
      onClick={backdropClose(onClose)}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="cr-modal-head">
        <div>
          <h2 id="new-work-title" className="cr-modal-title">{copy.modalTitle}</h2>
          <p className="small muted" style={{ margin: 0 }}>An agent turns this into a plan. Nothing runs until you approve it.</p>
        </div>
        <CloseX onClose={onClose} />
      </div>

      <form className="cr-modal-body" onSubmit={(e) => void submit(e)}>
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
            <span>
              Author · {ecosystemById(author.ecosystem).label} ·{" "}
              {agentsChosen.author ? (author.model === "default" ? "CLI default" : author.model) : "board column pick"}
            </span>
            <span>
              Checker · {ecosystemById(checker.ecosystem).label} ·{" "}
              {agentsChosen.checker ? (checker.model === "default" ? "CLI default" : checker.model) : "board column pick"}
            </span>
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
          {(preparingOnSubmit || (isPreparing && !settingsOpen)) && <span role="status">Preparing local workspace…</span>}
          {!repo && mode === "software" && (
            <span className="cr-warn-text">No repository chosen, so this ends in documents, not a pull request. Pick one under More settings.</span>
          )}
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
            More settings
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
          <p className="small muted" style={{ margin: "8px 0 0" }}>
            {repo
              ? STRATEGY_NOTE
              : "Prepare a repository to use its local checkout for the author run."}
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
                    checkoutBound={Boolean(repo)}
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
            {preparingOnSubmit
              ? "Preparing workspace…"
              : isCapturing
              ? "Adding…"
              : mode === "nuclear-grade"
                ? "Add packet"
                : mode === "software"
                  ? "Add change"
                  : "Add deliverable"}
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
  checkoutBound = false,
}: {
  title: string;
  idPrefix: string;
  value: AgentRuntimeSelection;
  checkoutBound?: boolean;
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
          {CLI_ECOSYSTEMS.map((c) => {
            const noCheckout = checkoutBound && c.runnable && !CHECKOUT_AUTHORS.includes(c.id);
            return (
              <option key={c.id} value={c.id} disabled={!c.runnable || noCheckout}>
                {c.label} ({c.cliCommand}){!c.runnable ? " — Not yet runnable" : noCheckout ? " — Can't work in a checkout yet" : ""}
              </option>
            );
          })}
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
