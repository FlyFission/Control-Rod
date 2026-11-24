import { createContext, useContext } from "react";
import type { ScramSummary, WorkspaceProject } from "../api/types.js";
import { useActiveProject } from "./projects.js";

/**
 * What a real SCRAM locks (control room redesign, section 6.6). An organization SCRAM locks every
 * action that changes work, everywhere; a project SCRAM locks them for that project only. A drill
 * never locks anything. SCRAM controls themselves are never locked: this is for everything else.
 *
 * To lock a new control, call `useActionLock()` (or `useActionLock(projectRef)` where the control
 * belongs to one project) and disable the control while `locked`, showing `why`.
 */
export interface ScramLock {
  organization: boolean;
  /** Project ids (lower case) under a project SCRAM. */
  projects: ReadonlySet<string>;
}

export const NO_LOCK: ScramLock = { organization: false, projects: new Set() };

/** The lock a list of SCRAMs in force puts on actions. Drills are skipped. */
export function lockFrom(scrams: readonly ScramSummary[] | undefined): ScramLock {
  const real = (scrams ?? []).filter((s) => !s.scram.drill);
  if (real.some((s) => s.scram.scope === "organization")) return { organization: true, projects: new Set() };
  return { organization: false, projects: new Set(real.flatMap((s) => (s.scram.project_id ? [s.scram.project_id.toLowerCase()] : []))) };
}

export const ScramLockContext = createContext<ScramLock>(NO_LOCK);

export interface ActionLock {
  locked: boolean;
  /** Why, in words, for a tooltip or a note beside the control. */
  why?: string;
}

/** Whether an action on a project (default: the project open now) is locked by a SCRAM. */
export function lockedFor(lock: ScramLock, project: Pick<WorkspaceProject, "id" | "name"> | string | null | undefined): ActionLock {
  if (lock.organization) return { locked: true, why: "A SCRAM is in force for the whole organization. Restart from the SCRAM banner first." };
  const refs = typeof project === "string" ? [project] : project ? [project.id, project.name] : [];
  if (refs.some((r) => lock.projects.has(r.trim().toLowerCase()))) return { locked: true, why: "A SCRAM is in force for this project. Restart from the SCRAM banner first." };
  return { locked: false };
}

export function useActionLock(projectRef?: string | null): ActionLock {
  const lock = useContext(ScramLockContext);
  const active = useActiveProject();
  return lockedFor(lock, projectRef === undefined ? active : projectRef);
}
