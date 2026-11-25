import { useContext, useEffect, useRef, useState } from "react";
import { CloseX } from "./CloseX.js";
import { backdropClose } from "../lib/dismiss.js";
import { useActionLock } from "../lib/scramLock.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, explain } from "../api/client.js";
import type { DataLane, WorkspaceProjectCreatePayload } from "../api/types.js";
import { browserPasskeys } from "../lib/decide.js";
import { MODE_COPY, type EngineeringMode } from "../lib/mode.js";
import { hydrateServerProjects, loadProjects, selectProject, WorkspaceProjectUser } from "../lib/projects.js";
import {
  CLI_ECOSYSTEMS,
  defaultAuthorSelection,
  defaultCheckerSelection,
  ecosystemById,
  type CliEcosystemId,
} from "../lib/runtimes.js";
import type { RepoOutfallStrategy } from "../lib/workDefaults.js";
import { sessionGeneration, stillCurrent } from "../lib/session.js";
import { LanePicker } from "./LanePicker.js";

interface ProjectModalProps {
  open: boolean;
  defaultMode: EngineeringMode;
  onClose: () => void;
}

/**
 * Lightweight Claude Projects–style creation modal: names a project, binds its engineering mode
 * (Software, Capital Projects, or Nuclear-Grade), optional default repository + outfall strategy, and Author/Checker CLIs.
 */
export function ProjectModal({ open, defaultMode, onClose }: ProjectModalProps) {
  // Creating a project is not tied to one: only an organization SCRAM locks it.
  const scramLock = useActionLock(null);
  const qc = useQueryClient();
  const projectUser = useContext(WorkspaceProjectUser);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<EngineeringMode>(defaultMode);
  const [repo, setRepo] = useState("");
  const [repoStrategy, setRepoStrategy] = useState<RepoOutfallStrategy>("worktree");
  const [lane, setLane] = useState<DataLane>("internal");
  // "": the server proposes a preset from the repository's top-level names (a proposal; the project's setting changes it).
  const [bays, setBays] = useState<"" | "software" | "capital-project">("");
  const [authorEco, setAuthorEco] = useState<CliEcosystemId>(defaultAuthorSelection().ecosystem);
  const [checkerEco, setCheckerEco] = useState<CliEcosystemId>(defaultCheckerSelection().ecosystem);
  const [error, setError] = useState<string | null>(null);

  const reposQuery = useQuery({
    queryKey: ["repos", ""],
    queryFn: () => api.repos(),
    enabled: open,
  });

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode, open]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (dlg) {
      if (open && !dlg.open) dlg.showModal();
      else if (!open && dlg.open) dlg.close();
    }
    if (!open) {
      setName("");
      setRepo("");
      setRepoStrategy("worktree");
      setLane("internal");
      setAuthorEco(defaultAuthorSelection().ecosystem);
      setCheckerEco(defaultCheckerSelection().ecosystem);
      setError(null);
    }
  }, [open]);

  const createMut = useMutation({
    mutationFn: async (startedUnder: number) => {
      const aEco = ecosystemById(authorEco);
      const cEco = ecosystemById(checkerEco);
      const payload: WorkspaceProjectCreatePayload = {
        name: name.trim(),
        mode,
        repo,
        repoStrategy,
        workspaceRoot: reposQuery.data?.workspace_root ?? "",
        lane,
        author: { ecosystem: aEco.id, model: aEco.defaultModel, reasoning: aEco.defaultReasoning },
        checker: { ecosystem: cEco.id, model: cEco.defaultModel, reasoning: cEco.defaultReasoning },
        ...(bays ? { work_lanes: { preset: bays } } : {}),
        // Light: routine cards start and finish on their own. Signed by this same passkey tap.
        ...(mode !== "nuclear-grade" ? { signing_preset: "light" as const } : {}),
      };
      const { options } = await api.adminCommandOptions("project.workspace-create", payload);
      if (!stillCurrent(startedUnder)) return;
      const assertion = await browserPasskeys.get(options);
      if (!stillCurrent(startedUnder)) return;
      return api.createWorkspaceProject(payload, assertion);
    },
    onSuccess: async (created, startedUnder) => {
      if (!created || !stillCurrent(startedUnder)) return;
      const fresh = await api.workspaceProjects().catch(() => loadProjects(projectUser));
      if (!stillCurrent(startedUnder)) return;
      hydrateServerProjects(projectUser, fresh.some((project) => project.id === created.id) ? fresh : [...fresh, created]);
      selectProject(projectUser, created.id);
      void qc.invalidateQueries({ queryKey: ["workspace-projects", projectUser] });
      void qc.invalidateQueries({ queryKey: ["admin"] });
      setName("");
      setRepo("");
      setError(null);
      onClose();
    },
    onError: (e, startedUnder) => {
      if (stillCurrent(startedUnder)) setError(explain(e, "Could not create project."));
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (scramLock.locked) return;
    if (!name.trim()) {
      setError("Enter a project name.");
      return;
    }
    if (authorEco === checkerEco) {
      setError("Default Author and Checker must use distinct CLI ecosystems (O6 independence).");
      return;
    }
    setError(null);
    createMut.mutate(sessionGeneration());
  }

  const copy = MODE_COPY[mode];

  return (
    <dialog
      ref={dialogRef}
      className="cr-modal"
      aria-labelledby="new-project-title"
      onClose={onClose}
      onClick={backdropClose(onClose)}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="cr-modal-head">
        <div>
          <h2 id="new-project-title" className="cr-modal-title">
            New project
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            Scope a dedicated board, default repository, and Author/Checker pair.
          </p>
        </div>
        <CloseX onClose={onClose} />
      </div>

      <form className="cr-modal-body" onSubmit={submit}>
        <div className="cr-form-grid">
          <label className="field">
            <span>Project name</span>
            <input
              type="text"
              data-guard
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                mode === "software"
                  ? "e.g. Control Rod"
                  : mode === "nuclear-grade"
                    ? "e.g. Core Auth Boundary"
                    : "e.g. Refinery Unit 4"
              }
              autoFocus
            />
          </label>
          <label className="field">
            <span>Board mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as EngineeringMode)}>
              <option value="software">Software</option>
              <option value="capital-projects">Capital Projects</option>
              <option value="nuclear-grade">Nuclear-Grade</option>
            </select>
          </label>
        </div>

        <div className="cr-form-grid">
          <label className="field">
            <span>Default repository (optional)</span>
            <select value={repo} onChange={(e) => setRepo(e.target.value)}>
              <option value="">None (pick per change)</option>
              {(reposQuery.data?.local ?? []).length > 0 && (
                <optgroup label={`Local clones (${reposQuery.data?.workspace_root || "projects"})`}>
                  {reposQuery.data!.local.map((r) => (
                    <option key={`local-${r.name}`} value={r.name}>
                      {r.name} ({r.branch})
                    </option>
                  ))}
                </optgroup>
              )}
              {(reposQuery.data?.github ?? []).length > 0 && (
                <optgroup label="GitHub repositories">
                  {reposQuery.data!.github.map((g) => (
                    <option key={`gh-${g.name_with_owner}`} value={g.name_with_owner}>
                      {g.name_with_owner}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {reposQuery.isError && (
              <span className="small error">{explain(reposQuery.error, "Could not list repositories.")}</span>
            )}
            {reposQuery.data?.github_error && (
              <span className="small muted">{reposQuery.data.github_error}</span>
            )}
          </label>
          <label className="field">
            <span>Default outfall strategy</span>
            <select value={repoStrategy} onChange={(e) => setRepoStrategy(e.target.value as RepoOutfallStrategy)}>
              <option value="worktree">New git worktree (Recommended)</option>
              <option value="fresh-clone">Fresh local clone</option>
              <option value="branch">New branch in local clone</option>
            </select>
          </label>
        </div>

        <div className="cr-form-grid">
          <label className="field">
            <span>{copy.custodyRoles[0]}</span>
            <select value={authorEco} onChange={(e) => setAuthorEco(e.target.value as CliEcosystemId)}>
              {CLI_ECOSYSTEMS.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.runnable}>
                  {c.label} ({c.cliCommand}){c.runnable ? "" : " — Not yet runnable"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{copy.custodyRoles[1]}</span>
            <select value={checkerEco} onChange={(e) => setCheckerEco(e.target.value as CliEcosystemId)}>
              {CLI_ECOSYSTEMS.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.runnable}>
                  {c.label} ({c.cliCommand}){c.runnable ? "" : " — Not yet runnable"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <LanePicker id="new-project-lane" value={lane} onChange={setLane} />

        <p className="small muted">
          {mode === "nuclear-grade"
            ? "Nuclear-grade: every release and accept is signed with your passkey."
            : "Cards start and finish on their own; your passkey is only for big things. Change it any time in Setup, under What needs your passkey."}
        </p>

        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}

        <div className="cr-modal-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={createMut.isPending || scramLock.locked} title={scramLock.why}>
            {createMut.isPending ? "Creating…" : "Create project"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
