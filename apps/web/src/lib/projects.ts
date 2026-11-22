import { useSyncExternalStore } from "react";
import type { CaptureView, DataLane, WorkPackage } from "../api/types.js";
import { loadMode, saveMode, type EngineeringMode } from "./mode.js";
import {
  defaultAuthorSelection,
  defaultCheckerSelection,
  type AgentRuntimeSelection,
} from "./runtimes.js";
import { readString, writeString } from "./storage.js";
import type { RepoOutfallStrategy } from "./workDefaults.js";

export interface WorkspaceProject {
  id: string;
  name: string;
  mode: EngineeringMode;
  repo: string;
  repoStrategy: RepoOutfallStrategy;
  workspaceRoot: string;
  lane: DataLane;
  author: AgentRuntimeSelection;
  checker: AgentRuntimeSelection;
  laneAgents?: Record<string, string>;
  createdAt: string;
}

function isEngineeringMode(value: unknown): value is EngineeringMode {
  return value === "software" || value === "capital-projects" || value === "nuclear-grade";
}

const PROJECTS_KEY = "cr.projects.v1";
const ACTIVE_PROJECT_KEY = "cr.active-project";

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedProjects: WorkspaceProject[] = [];

function notify() {
  cachedRaw = undefined;
  for (const fn of listeners) fn();
}

export function loadProjects(): WorkspaceProject[] {
  const raw = readString(PROJECTS_KEY);
  if (raw === cachedRaw) return cachedProjects;
  cachedRaw = raw;
  if (!raw) {
    cachedProjects = [];
    return cachedProjects;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedProjects = [];
      return cachedProjects;
    }
    cachedProjects = parsed.filter(
      (item): item is WorkspaceProject =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as WorkspaceProject).id === "string" &&
        typeof (item as WorkspaceProject).name === "string" &&
        isEngineeringMode((item as WorkspaceProject).mode),
    );
    return cachedProjects;
  } catch {
    cachedProjects = [];
    return cachedProjects;
  }
}

function persistProjects(list: WorkspaceProject[]) {
  writeString(PROJECTS_KEY, JSON.stringify(list));
  notify();
}

export function loadActiveProjectId(): string | null {
  const v = readString(ACTIVE_PROJECT_KEY);
  if (!v) return null;
  const list = loadProjects();
  return list.some((p) => p.id === v) ? v : null;
}

export function selectProject(id: string | null): void {
  if (!id) {
    writeString(ACTIVE_PROJECT_KEY, "");
    notify();
    return;
  }
  const target = loadProjects().find((p) => p.id === id);
  if (!target) {
    writeString(ACTIVE_PROJECT_KEY, "");
    notify();
    return;
  }
  writeString(ACTIVE_PROJECT_KEY, target.id);
  if (loadMode() !== target.mode) {
    saveMode(target.mode);
  }
  notify();
}

export function switchModeAndSyncProject(nextMode: EngineeringMode): void {
  const activeId = loadActiveProjectId();
  if (activeId) {
    const active = loadProjects().find((p) => p.id === activeId);
    if (active && active.mode !== nextMode) {
      writeString(ACTIVE_PROJECT_KEY, "");
    }
  }
  saveMode(nextMode);
  notify();
}

export function createProject(input: {
  name: string;
  mode: EngineeringMode;
  repo?: string;
  repoStrategy?: RepoOutfallStrategy;
  workspaceRoot?: string;
  lane?: DataLane;
  author?: AgentRuntimeSelection;
  checker?: AgentRuntimeSelection;
  laneAgents?: Record<string, string>;
}): WorkspaceProject {
  const trimmed = input.name.trim();
  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  const id = `proj-${slug || "work"}-${Math.random().toString(36).slice(2, 6)}`;
  const proj: WorkspaceProject = {
    id,
    name: trimmed || "Untitled project",
    mode: input.mode,
    repo: (input.repo ?? "").trim(),
    repoStrategy: input.repoStrategy ?? "worktree",
    workspaceRoot: (input.workspaceRoot ?? "").trim(),
    lane: input.lane ?? "internal",
    author: input.author ?? defaultAuthorSelection(),
    checker: input.checker ?? defaultCheckerSelection(),
    ...(input.laneAgents && Object.keys(input.laneAgents).length > 0 ? { laneAgents: input.laneAgents } : {}),
    createdAt: new Date().toISOString(),
  };
  const next = [...loadProjects(), proj];
  persistProjects(next);
  selectProject(proj.id);
  return proj;
}

export function updateProject(
  id: string,
  patch: Partial<Omit<WorkspaceProject, "id" | "createdAt">>,
): WorkspaceProject | null {
  const list = loadProjects();
  let updated: WorkspaceProject | null = null;
  const next = list.map((p) => {
    if (p.id !== id) return p;
    updated = { ...p, ...patch };
    return updated;
  });
  if (!updated) return null;
  persistProjects(next);
  return updated;
}

export function hydrateServerProjects(serverList: WorkspaceProject[]): void {
  if (!Array.isArray(serverList)) return;
  persistProjects(serverList);
}

export function deleteProject(id: string): void {
  const next = loadProjects().filter((p) => p.id !== id);
  if (loadActiveProjectId() === id) {
    writeString(ACTIVE_PROJECT_KEY, "");
  }
  persistProjects(next);
}

export function useProjects(): WorkspaceProject[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    loadProjects,
    () => [],
  );
}

export function useActiveProjectId(): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    loadActiveProjectId,
    () => null,
  );
}

export function useActiveProject(): WorkspaceProject | null {
  const projects = useProjects();
  const activeId = useActiveProjectId();
  return activeId ? (projects.find((p) => p.id === activeId) ?? null) : null;
}

/** Extracts a `[key:value]` header tag from capture/brief text. */
export function extractBracketTag(text: string | undefined, key: string): string | undefined {
  if (!text) return undefined;
  const re = new RegExp(`\\[${key}:([^\\]]+)\\]`, "i");
  const m = text.match(re);
  return m?.[1]?.trim();
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
