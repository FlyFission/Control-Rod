import { ApiError } from "../api/client.js";
import {
  BUILTIN_LANE_CATALOG,
  buildPresetSpec,
  parseWorkflowSpec,
  type ConflictChoice,
  type LaneSkillEntry,
  type UpstreamLaneSnapshot,
  type WorkflowLaneSpec,
  type WorkflowSpecV1,
} from "./workflowSpec.js";

function url(path: string): string {
  const origin = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://localhost";
  return new URL(path, origin).toString();
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
  const res = await fetch(url(path), init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown;
  if (text.length > 0) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError(res.status, "invalid_response", `Request failed (${res.status})`);
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as { code?: string; message?: string; change?: string };
    throw new ApiError(res.status, err.code ?? "error", err.message ?? `Request failed (${res.status})`, err.change);
  }
  return data as T;
}

function isFallbackable(err: unknown): boolean {
  if (err instanceof ApiError) return err.status === 404 || err.status === 501 || err.status === 503;
  return err instanceof TypeError;
}

export interface WorkflowCatalogResponse {
  lanes: WorkflowLaneSpec[];
}

export interface WorkflowSpecResponse {
  spec: WorkflowSpecV1;
  saved: boolean;
  source?: "saved" | "inherited" | "preset";
  offline?: boolean;
}

export interface LaneUpdateCheckResult {
  laneId: string;
  status: string;
  summary: string;
}

export interface LaneUpdateCheckResponse {
  upToDate: boolean;
  upstream?: UpstreamLaneSnapshot;
  spec?: WorkflowSpecV1;
  results?: LaneUpdateCheckResult[];
}

export interface CardWorkflowRunLogEntry {
  eventId: string;
  at: string;
  role?: string;
  workflow?: string;
  spec_version?: string;
  skill_versions?: Array<{
    lane: string;
    skill: string;
    commit: string;
    digest: string;
    forked: boolean;
    agent: string | null;
  }>;
  nuclear_lane_modified?: { modified: boolean };
  auto_updated_lanes?: Array<{ laneId: string; summary: string }>;
  problem?: string;
}

export type WorkflowScope = { scope: "project" | "package" | "default"; id: string };

function scopeQuery(target?: string | WorkflowScope): string {
  if (!target) return "";
  if (typeof target === "string") {
    return `?scope=project&id=${encodeURIComponent(target)}`;
  }
  return `?scope=${encodeURIComponent(target.scope)}&id=${encodeURIComponent(target.id)}`;
}

function scopeFields(target?: string | WorkflowScope): { scope?: string; id?: string; project_id?: string } {
  if (!target) return {};
  if (typeof target === "string") return { scope: "project", id: target, project_id: target };
  return { scope: target.scope, id: target.id, ...(target.scope === "project" ? { project_id: target.id } : {}) };
}

export const workflowApi = {
  async getCatalog(): Promise<WorkflowCatalogResponse> {
    try {
      const res = await request<{
        lanes?: WorkflowLaneSpec[];
        workflowLanes?: WorkflowLaneSpec[];
        contextLanes?: WorkflowLaneSpec[];
        customLanes?: WorkflowLaneSpec[];
      }>("GET", "/workflows/catalog");
      const lanes = res.lanes ?? [
        ...(res.workflowLanes ?? []),
        ...(res.contextLanes ?? []),
        ...(res.customLanes ?? []),
      ];
      return { lanes };
    } catch (err) {
      if (isFallbackable(err)) {
        return { lanes: Object.values(BUILTIN_LANE_CATALOG) };
      }
      throw err;
    }
  },

  async getSpec(target?: string | WorkflowScope): Promise<WorkflowSpecResponse> {
    const query = scopeQuery(target);
    try {
      const res = await request<{ spec?: unknown; saved?: boolean; source?: "saved" | "inherited" | "preset" } & Partial<WorkflowSpecV1>>(
        "GET",
        `/workflows/spec${query}`,
      );
      const raw = res && "spec" in res && res.spec ? res.spec : res;
      return {
        spec: parseWorkflowSpec(raw),
        saved: res.saved ?? res.source === "saved",
        ...(res.source ? { source: res.source } : {}),
      };
    } catch (err) {
      if (isFallbackable(err)) {
        return { spec: buildPresetSpec("superpowers", "light", "start-and-merge"), saved: false, offline: true };
      }
      throw err;
    }
  },

  async saveSpec(spec: WorkflowSpecV1, target?: string | WorkflowScope): Promise<WorkflowSpecResponse> {
    const query = scopeQuery(target);
    const payload = { ...spec, updatedAt: new Date().toISOString() };
    try {
      const res = await request<{ spec?: unknown; saved?: boolean } & Partial<WorkflowSpecV1>>(
        "PUT",
        `/workflows/spec${query}`,
        {
          ...scopeFields(target),
          spec: payload,
        },
      );
      const raw = res && "spec" in res && res.spec ? res.spec : payload;
      return { spec: parseWorkflowSpec(raw), saved: res.saved ?? true };
    } catch (err) {
      if (isFallbackable(err)) {
        return { spec: payload, saved: true, offline: true };
      }
      throw err;
    }
  },

  async importRepoLane(repoUrl: string, name?: string, target?: string | WorkflowScope): Promise<{ lane: WorkflowLaneSpec }> {
    try {
      return await request<{ lane: WorkflowLaneSpec }>("POST", "/workflows/lanes/import", {
        url: repoUrl,
        name,
        ...scopeFields(target),
      });
    } catch (err) {
      if (isFallbackable(err)) {
        const trimmed = repoUrl.trim();
        const slug = trimmed.replace(/^https?:\/\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "imported-repo";
        const display = name?.trim() || trimmed.split("/").filter(Boolean).slice(-1)[0] || "Imported pack";
        const skills: LaneSkillEntry[] = [
          { skill: `${slug}:intake`, label: `${display} intake`, defaultStage: "plan" },
          { skill: `${slug}:implement`, label: `${display} implement`, defaultStage: "author" },
          { skill: `${slug}:verify`, label: `${display} verify`, defaultStage: "check" },
        ];
        return {
          lane: {
            id: `repo-${slug}`,
            name: display,
            kind: "workflow",
            enabled: true,
            source: {
              type: "git-url",
              url: trimmed,
              commit: "head-local",
              digest: `sha256:import-${slug}`,
              license: "MIT",
            },
            forked: false,
            updatePolicy: "auto",
            nativeSkills: skills,
            skills: skills.map((s) => ({ ...s })),
            versions: [],
            pendingConflict: null,
          },
        };
      }
      throw err;
    }
  },

  async checkLaneUpdates(
    laneId?: string,
    target?: string | WorkflowScope,
    spec?: WorkflowSpecV1,
  ): Promise<LaneUpdateCheckResponse> {
    try {
      return await request<LaneUpdateCheckResponse>("POST", "/workflows/lanes/update-check", {
        ...(laneId ? { laneId } : {}),
        ...(spec ? { spec } : {}),
        ...scopeFields(target),
      });
    } catch (err) {
      if (isFallbackable(err)) {
        return { upToDate: true };
      }
      throw err;
    }
  },

  async resolveLaneConflict(
    laneId: string,
    resolutions: Record<string, ConflictChoice>,
    target?: string | WorkflowScope,
    spec?: WorkflowSpecV1,
  ): Promise<{ ok: boolean; spec?: WorkflowSpecV1 }> {
    try {
      return await request<{ ok: boolean; spec?: WorkflowSpecV1 }>("POST", "/workflows/lanes/resolve-conflict", {
        laneId,
        resolutions,
        ...(spec ? { spec } : {}),
        ...scopeFields(target),
      });
    } catch (err) {
      if (isFallbackable(err)) {
        return { ok: true };
      }
      throw err;
    }
  },

  async rollbackLane(
    laneId: string,
    targetVersion?: number,
    target?: string | WorkflowScope,
    spec?: WorkflowSpecV1,
  ): Promise<{ ok: boolean; spec?: WorkflowSpecV1 }> {
    try {
      return await request<{ ok: boolean; spec?: WorkflowSpecV1 }>("POST", "/workflows/lanes/rollback", {
        laneId,
        ...(targetVersion !== undefined ? { targetVersion } : {}),
        ...(spec ? { spec } : {}),
        ...scopeFields(target),
      });
    } catch (err) {
      if (isFallbackable(err)) {
        return { ok: true };
      }
      throw err;
    }
  },

  async saveCustomPack(lane: WorkflowLaneSpec, target?: string | WorkflowScope): Promise<{ ok: boolean; lane: WorkflowLaneSpec }> {
    try {
      const res = await request<{ ok?: boolean; lane?: WorkflowLaneSpec; pack?: WorkflowLaneSpec }>(
        "POST",
        "/workflows/packs",
        {
          pack: lane,
          lane,
          ...scopeFields(target),
        },
      );
      return { ok: res.ok ?? true, lane: res.lane ?? res.pack ?? lane };
    } catch (err) {
      if (isFallbackable(err)) {
        return { ok: true, lane };
      }
      throw err;
    }
  },

  async getCardWorkflowLog(packageId: string): Promise<{ packageId: string; runs: CardWorkflowRunLogEntry[] }> {
    try {
      return await request<{ packageId: string; runs: CardWorkflowRunLogEntry[] }>(
        "GET",
        `/workflows/packages/${encodeURIComponent(packageId)}/log`,
      );
    } catch (err) {
      if (isFallbackable(err)) {
        return { packageId, runs: [] };
      }
      throw err;
    }
  },
};
