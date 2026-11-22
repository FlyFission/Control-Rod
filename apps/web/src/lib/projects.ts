import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { CaptureView, WorkPackage, WorkspaceProject } from "../api/types.js";
import { loadMode, saveMode, type EngineeringMode } from "./mode.js";
import { readString, writeString } from "./storage.js";

function isEngineeringMode(value: unknown): value is EngineeringMode {
  return value === "software" || value === "capital-projects" || value === "nuclear-grade";
}

const PROJECTS_KEY = "cr.projects.v1";
const ACTIVE_PROJECT_KEY = "cr.active-project";
const scopedKey = (key: string, user: string) => `${key}:${encodeURIComponent(user)}`;

/** The Shell supplies the verified session user for every workspace view. */
export const WorkspaceProjectUser = createContext<string | undefined>(undefined);

const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function readProjects(user: string | undefined): string | undefined {
  return user ? readString(scopedKey(PROJECTS_KEY, user)) : undefined;
}

function parseProjects(raw: string | undefined): WorkspaceProject[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is WorkspaceProject =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as WorkspaceProject).id === "string" &&
        typeof (item as WorkspaceProject).name === "string" &&
        isEngineeringMode((item as WorkspaceProject).mode),
    );
  } catch {
    return [];
  }
}

export function loadProjects(user: string | undefined): WorkspaceProject[] {
  return parseProjects(readProjects(user));
}

function persistProjects(user: string, list: WorkspaceProject[]) {
  writeString(scopedKey(PROJECTS_KEY, user), JSON.stringify(list));
  notify();
}

function readActiveProjectId(user: string | undefined): string | undefined {
  return user ? readString(scopedKey(ACTIVE_PROJECT_KEY, user)) : undefined;
}

export function selectProject(user: string | undefined, id: string | null): void {
  if (!user) return;
  const target = id ? loadProjects(user).find((p) => p.id === id) : undefined;
  writeString(scopedKey(ACTIVE_PROJECT_KEY, user), target?.id ?? "");
  if (target && loadMode() !== target.mode) {
    saveMode(target.mode);
  }
  notify();
}

export function switchModeAndSyncProject(user: string | undefined, nextMode: EngineeringMode): void {
  const activeId = readActiveProjectId(user);
  if (user && activeId) {
    const active = loadProjects(user).find((p) => p.id === activeId);
    if (active && active.mode !== nextMode) {
      writeString(scopedKey(ACTIVE_PROJECT_KEY, user), "");
    }
  }
  saveMode(nextMode);
  notify();
}

/** Stores the full project returned by the server after a signed edit. */
export function replaceProject(user: string, project: WorkspaceProject): void {
  const list = loadProjects(user);
  persistProjects(user, list.map((entry) => entry.id === project.id ? project : entry));
}

export function hydrateServerProjects(user: string | undefined, serverList: WorkspaceProject[]): void {
  if (!user || !Array.isArray(serverList)) return;
  persistProjects(user, serverList);
}

export function deleteProject(user: string | undefined, id: string): void {
  if (!user) return;
  const next = loadProjects(user).filter((p) => p.id !== id);
  if (readActiveProjectId(user) === id) {
    writeString(scopedKey(ACTIVE_PROJECT_KEY, user), "");
  }
  persistProjects(user, next);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function useProjects(): WorkspaceProject[] {
  const user = useContext(WorkspaceProjectUser);
  const raw = useSyncExternalStore(subscribe, () => readProjects(user), () => undefined);
  return useMemo(() => parseProjects(raw), [raw]);
}

export function useActiveProject(): WorkspaceProject | null {
  const user = useContext(WorkspaceProjectUser);
  const projects = useProjects();
  const activeId = useSyncExternalStore(subscribe, () => readActiveProjectId(user), () => undefined);
  return activeId ? (projects.find((p) => p.id === activeId) ?? null) : null;
}

/** Extracts a `[key:value]` header tag from capture/brief text. */
export function extractBracketTag(text: string | undefined, key: string): string | undefined {
  if (!text) return undefined;
  const re = new RegExp(`\\[${key}:([^\\]]+)\\]`, "i");
  const m = text.match(re);
  return m?.[1]?.trim();
}

export function projectCaptureTag(name: string, activeProject: WorkspaceProject | null): string | null {
  const value = name.trim();
  if (!value) return null;
  if (activeProject && value.toLowerCase() === activeProject.name.toLowerCase()) return `[project-id:${activeProject.id}]`;
  return `[project:${value}]`;
}

/** Names are display text. Historical records may have a name in place of an ID. */
export function projectDisplayName(reference: string, projects: readonly WorkspaceProject[]): string {
  return projects.find((project) => project.id === reference)?.name ?? reference;
}

/** Determines whether a capture belongs on the board for the active mode and optional project. */
export function captureMatchesScope(
  capture: CaptureView,
  mode: EngineeringMode,
  activeProject: WorkspaceProject | null,
): boolean {
  const taggedMode = extractBracketTag(capture.text, "mode");
  if (isEngineeringMode(taggedMode)) {
    if (taggedMode !== mode) return false;
  }
  if (!activeProject) return true;
  const taggedId = extractBracketTag(capture.text, "project-id");
  if (taggedId) return taggedId === activeProject.id;
  const taggedProj = extractBracketTag(capture.text, "project");
  if (
    taggedProj &&
    (taggedProj.toLowerCase() === activeProject.name.toLowerCase() ||
      taggedProj.toLowerCase() === activeProject.id.toLowerCase())
  ) {
    return true;
  }
  return false;
}

/** Determines whether a work package belongs on the board for the active mode and optional project. */
export function packageMatchesScope(
  pkg: WorkPackage,
  mode: EngineeringMode,
  activeProject: WorkspaceProject | null,
): boolean {
  const projectRef = (pkg.project ?? "").trim().toLowerCase();
  const matchesActiveProject =
    activeProject !== null &&
    (projectRef === activeProject.id.toLowerCase() || projectRef === activeProject.name.toLowerCase());
  const taggedMode = extractBracketTag(pkg.title, "mode");
  const rawMode = (pkg as { mode?: string }).mode;
  const ctxProfile = (pkg as { context_profile?: string }).context_profile;
  const effectiveMode = isEngineeringMode(taggedMode)
    ? taggedMode
    : ctxProfile === "nuclear" && (rawMode === "software" || rawMode === "general" || !rawMode)
      ? "nuclear-grade"
      : matchesActiveProject &&
          activeProject.mode === "nuclear-grade" &&
          (rawMode === "software" || rawMode === "general")
        ? "nuclear-grade"
        : isEngineeringMode(rawMode)
          ? rawMode
          : undefined;
  if (effectiveMode && effectiveMode !== mode) {
    return false;
  }
  if (!activeProject) return true;
  return matchesActiveProject;
}
