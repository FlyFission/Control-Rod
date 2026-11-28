import { randomUUID } from "node:crypto";
import { type SigningPolicy, parseSteps, policySummary, signPolicy } from "./signing-policy.js";
import type { Db, Tx } from "./db/index.js";
import { appendEvent } from "./events.js";
import type { Caller } from "./admin.js";
import { checkSchema, createProject, type DataLane } from "./tenancy.js";
import { Refusal } from "./refusal.js";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { isContainedIn, isSafeRepoIdentifier, resolveSafeWorkspaceRoot } from "./repos.js";
import { type WorkLaneSet, laneSetOf, proposePreset, resolveChoice } from "./work-lanes.js";
import { refusePracticePick } from "./practice.js";

const projectIdFor = () => `prj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

export type EngineeringMode = "software" | "capital-projects" | "nuclear-grade";
export type RepoOutfallStrategy = "worktree" | "fresh-clone" | "branch";

export interface AgentRuntimeSelection {
  ecosystem: string;
  model: string;
  reasoning: string;
}

export interface ProjectWorkspacePrefs {
  repo: string;
  repoStrategy: RepoOutfallStrategy;
  workspaceRoot: string;
  lane: DataLane;
  author: AgentRuntimeSelection;
  checker: AgentRuntimeSelection;
  laneAgents?: Record<string, string>;
  /** false turns off the dependency install the daemon runs in a new worktree before the author starts. */
  setup?: boolean;
}

export interface WorkspaceProjectView {
  id: string;
  name: string;
  mode: EngineeringMode;
  status: string;
  repo: string;
  repoStrategy: RepoOutfallStrategy;
  workspaceRoot: string;
  lane: DataLane;
  author: AgentRuntimeSelection;
  checker: AgentRuntimeSelection;
  laneAgents?: Record<string, string>;
  /** false when the project turned off the install from its lockfile in new worktrees. */
  setup?: boolean;
  /** The work lanes the Plant's bays follow. An old project reads as the capital-project preset. */
  work_lanes: WorkLaneSet;
  /** What needs a passkey on this project's routine cards, when the owner has chosen. */
  signing?: { preset: string; steps: Record<string, string>; version: number; signed_by: string; signed_at: string };
  /** True for the practice project, whose cards run only on the bundled practice agents. */
  practice?: boolean;
  createdAt: string;
}

const VALID_MODES = new Set<EngineeringMode>(["software", "capital-projects", "nuclear-grade"]);
const VALID_STRATEGIES = new Set<RepoOutfallStrategy>(["worktree", "fresh-clone", "branch"]);
const VALID_LANES = new Set<DataLane>(["public", "internal", "proprietary", "client-confidential", "restricted"]);

const DEFAULT_PREFS: ProjectWorkspacePrefs = {
  repo: "",
  repoStrategy: "worktree",
  workspaceRoot: "",
  lane: "internal",
  author: { ecosystem: "claude", model: "default", reasoning: "default" },
  checker: { ecosystem: "codex", model: "default", reasoning: "default" },
};

const prefsKey = (orgId: string) => `workspace_project_prefs:${orgId}`;

async function readPrefsMap(q: { query: Db["query"] }, orgId: string): Promise<Record<string, Partial<ProjectWorkspacePrefs>>> {
  const r = await q.query<{ value: string }>("select value from settings where key = $1", [prefsKey(orgId)]);
  if (!r.rows[0]) return {};
  try {
    const parsed = JSON.parse(r.rows[0].value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, Partial<ProjectWorkspacePrefs>>)
      : {};
  } catch {
    return {};
  }
}

// Creation and update hold runAdmin's organization lock across the map read and write.
async function writePrefsMap(c: Tx, orgId: string, map: Record<string, Partial<ProjectWorkspacePrefs>>): Promise<void> {
  await c.query(
    "insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
    [prefsKey(orgId), JSON.stringify(map)],
  );
}

function cleanSelection(v: unknown, fallback: AgentRuntimeSelection): AgentRuntimeSelection {
  if (!v || typeof v !== "object" || Array.isArray(v)) return fallback;
  const o = v as Record<string, unknown>;
  const ecosystem = typeof o.ecosystem === "string" && /^[a-z0-9-]{1,32}$/.test(o.ecosystem) ? o.ecosystem : fallback.ecosystem;
  const model = typeof o.model === "string" && /^[a-zA-Z0-9._:/@-]{1,100}$/.test(o.model) ? o.model : fallback.model;
  const reasoning = typeof o.reasoning === "string" && /^[a-z0-9-]{1,20}$/.test(o.reasoning) ? o.reasoning : fallback.reasoning;
  return { ecosystem, model, reasoning };
}

function cleanLaneAgents(v: unknown): Record<string, string> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, rawVal] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{1,32}$/.test(k)) continue;
    if (typeof rawVal !== "string") continue;
    const trimmed = rawVal.trim();
    if (!/^[a-zA-Z0-9._:/@-]{1,100}$/.test(trimmed)) continue;
    out[k] = trimmed;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function resolveWorkspaceMode(body: Record<string, unknown>): EngineeringMode {
  if (Array.isArray(body.qa_overlays) && body.qa_overlays.includes("nuclear-grade")) {
    return "nuclear-grade";
  }
  const modeRaw = String(body.mode ?? "software");
  if (modeRaw === "nuclear-grade") return "nuclear-grade";
  return modeRaw === "capital-projects" ? "capital-projects" : "software";
}

/**
 * The names at the top of a local clone, to propose a work-lane preset from. Names only: no file is read.
 * A GitHub name, an unsafe name, a clone that is not inside the workspace root or one that is unreadable
 * gives no entries, and the proposal then falls back to the project's mode.
 */
export function repoRootEntries(repo: string, workspaceRoot: string): string[] {
  try {
    if (!repo || repo.includes("/") || !isSafeRepoIdentifier(repo)) return [];
    const root = resolveSafeWorkspaceRoot(workspaceRoot || undefined);
    const dir = join(root, repo);
    if (!isContainedIn(root, dir)) return [];
    return readdirSync(dir).slice(0, 500);
  } catch {
    return [];
  }
}

function mergePrefs(raw?: Partial<ProjectWorkspacePrefs>): ProjectWorkspacePrefs {
  const laneAgents = cleanLaneAgents(raw?.laneAgents);
  return {
    repo: typeof raw?.repo === "string" ? raw.repo.trim().slice(0, 200) : DEFAULT_PREFS.repo,
    repoStrategy: raw?.repoStrategy && VALID_STRATEGIES.has(raw.repoStrategy) ? raw.repoStrategy : DEFAULT_PREFS.repoStrategy,
    workspaceRoot: typeof raw?.workspaceRoot === "string" ? raw.workspaceRoot.trim().slice(0, 500) : DEFAULT_PREFS.workspaceRoot,
    lane: raw?.lane && VALID_LANES.has(raw.lane) ? raw.lane : DEFAULT_PREFS.lane,
    author: cleanSelection(raw?.author, DEFAULT_PREFS.author),
    checker: cleanSelection(raw?.checker, DEFAULT_PREFS.checker),
    ...(laneAgents ? { laneAgents } : {}),
    ...(raw?.setup === false ? { setup: false } : {}),
  };
}

/** Looks up runtime preferences by project ID or case-insensitive name within its owning organization. */
export async function projectRuntimePrefs(
  q: { query: Db["query"] },
  orgId: string,
  projectRef: string,
): Promise<{
  author?: string;
  checker?: string;
  authorModel?: string;
  checkerModel?: string;
  laneAgents?: Record<string, string>;
  setup: boolean;
} | null> {
  const ref = projectRef.trim();
  if (!ref) return null;
  const r = await q.query<{ id: string }>(
    `select id
       from projects
      where org_id = $1 and coalesce(body->>'status', 'active') = 'active'
        and (id = $2 or lower(body->>'name') = lower($2))
      order by (id = $2) desc, created_at, id
      limit 1`,
    [orgId, ref],
  );
  const row = r.rows[0];
  if (!row) return null;
  const prefsMap = await readPrefsMap(q, orgId);
  const prefs = mergePrefs(prefsMap[row.id]);
  return {
    author: prefs.author.ecosystem,
    checker: prefs.checker.ecosystem,
    authorModel: prefs.author?.model,
    checkerModel: prefs.checker?.model,
    ...(prefs.laneAgents ? { laneAgents: prefs.laneAgents } : {}),
    setup: prefs.setup !== false,
  };
}

/**
 * The data lane a workspace project sets for its new cards, read from the server's own record, or
 * undefined when the capture names no active project of this organization. A capture is never
 * classified below it, whatever lane a browser with a stale copy of the project sends.
 */
export async function projectDefaultLane(q: { query: Db["query"] }, orgId: string, projectId: string): Promise<DataLane | undefined> {
  // An archived project keeps its floor: a stale tab must not lower the lane of work tagged to it.
  const r = await q.query("select 1 from projects where id = $1 and org_id = $2", [projectId, orgId]);
  if (!r.rowCount) return undefined;
  return mergePrefs((await readPrefsMap(q, orgId))[projectId]).lane;
}

/** Lists active projects for the caller's organization with their workspace defaults. */
export async function listWorkspaceProjects(db: Db, orgId: string): Promise<WorkspaceProjectView[]> {
  const rows = await db.query<{ id: string; body: Record<string, unknown>; created_at: Date }>(
    "select id, body, created_at from projects where org_id = $1 and coalesce(body->>'status', 'active') = 'active' order by created_at asc, id asc",
    [orgId],
  );
  const prefsMap = await readPrefsMap(db, orgId);
  return rows.rows.map((r) => {
    const mode = resolveWorkspaceMode(r.body);
    const prefs = mergePrefs(prefsMap[r.id]);
    return {
      id: r.id,
      name: String(r.body.name ?? r.id),
      mode,
      status: String(r.body.status ?? "active"),
      ...prefs,
      work_lanes: laneSetOf(r.body.work_lanes),
      ...policySummary(r.body),
      ...(r.body.practice === true ? { practice: true } : {}),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    };
  });
}

/** Creates a project and stores its defaults inside the signed administrative command. */
export async function createWorkspaceProject(
  c: Tx,
  caller: Caller,
  input: Record<string, unknown>,
  signed?: { subject: string; nonce?: string; assertion: SigningPolicy["assertion"] },
  internal?: { practice?: boolean },
): Promise<WorkspaceProjectView> {
  const practice = internal?.practice === true;
  // The practice agents belong to the practice project, which only Control Rod makes.
  if (!practice) refusePracticePick(agentPicks(input));
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) throw new Refusal(400, "invalid", "Project name is required (max 120 chars)");
  const mode = typeof input.mode === "string" && VALID_MODES.has(input.mode as EngineeringMode)
    ? (input.mode as EngineeringMode)
    : "software";
  const prefs = mergePrefs({
    ...(typeof input.repo === "string" ? { repo: input.repo } : {}),
    ...(typeof input.repoStrategy === "string" ? { repoStrategy: input.repoStrategy as RepoOutfallStrategy } : {}),
    ...(typeof input.workspaceRoot === "string" ? { workspaceRoot: input.workspaceRoot } : {}),
    ...(typeof input.lane === "string" ? { lane: input.lane as DataLane } : {}),
    ...(input.author !== undefined ? { author: input.author as AgentRuntimeSelection } : {}),
    ...(input.checker !== undefined ? { checker: input.checker as AgentRuntimeSelection } : {}),
    ...(input.laneAgents !== undefined ? { laneAgents: input.laneAgents as Record<string, string> } : {}),
  });
  // A shared author and checker CLI is allowed here; the pre-check holds for an independent runtime
  // or the owner's override before acceptance, so the protection sits where it matters.
  // The lanes the person chose, or the preset the repository and mode propose. Either way they are the
  // project's setting from the start and its setting changes them.
  const lanes = input.work_lanes !== undefined
    ? resolveChoice(input.work_lanes)
    : resolveChoice({ preset: proposePreset({ entries: repoRootEntries(prefs.repo, prefs.workspaceRoot), mode }).preset });
  const actor = { kind: "human" as const, id: caller.userName };
  const id = projectIdFor();
  await createProject(c, {
    id,
    org_id: caller.orgId,
    name,
    mode: mode === "nuclear-grade" ? "software" : mode,
    ...(mode === "nuclear-grade" ? { default_context_profile: "nuclear" as const } : {}),
    default_rigor: "standard",
    lanes: [prefs.lane],
    qa_overlays: mode === "nuclear-grade" ? ["nuclear-grade"] : [],
    autonomy_level: 0,
    status: "active",
    work_lanes: lanes,
    ...(practice ? { practice: true } : {}),
  }, actor);
  // A signing preset chosen in the create form is signed by the same passkey as the project.
  // Nuclear-grade projects sign every step whatever is chosen, so none is stored for them.
  if (input.signing_preset !== undefined && signed && mode !== "nuclear-grade") {
    const { preset, steps } = parseSteps(input.signing_preset, undefined);
    const policy = signPolicy({ prior: null, preset, steps, signedBy: caller.userName, ...signed });
    await c.query("update projects set body = jsonb_set(body, '{signing_policy}', $2::jsonb) where id = $1", [id, policy]);
    await appendEvent(c, "project.signing-policy-set", id, actor, { policy: policy.id, version: policy.version, preset, steps });
  }
  const map = await readPrefsMap(c, caller.orgId);
  map[id] = prefs;
  await writePrefsMap(c, caller.orgId, map);
  await appendEvent(c, "project.workspace-updated", id, actor, {
    repo: prefs.repo,
    repo_strategy: prefs.repoStrategy,
    lane: prefs.lane,
    author: prefs.author.ecosystem,
    checker: prefs.checker.ecosystem,
    ...(prefs.laneAgents ? { lane_agents: prefs.laneAgents } : {}),
  });
  return {
    id,
    name,
    mode,
    status: "active",
    ...prefs,
    work_lanes: lanes,
    ...(practice ? { practice: true } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** Every agent a create or update input names: the author, the checker and each lane's agent. */
function agentPicks(input: Record<string, unknown>): unknown[] {
  const lanes = input.laneAgents && typeof input.laneAgents === "object" && !Array.isArray(input.laneAgents)
    ? Object.values(input.laneAgents as Record<string, unknown>)
    : [];
  return [input.author, input.checker, ...lanes];
}

/** What may change on the practice project: its lanes on the board, and nothing that picks an agent or a repository. */
const PRACTICE_EDITABLE = new Set(["work_lanes"]);

/** Updates a project's workspace defaults (never mutating mode) with an audited hash-chain event. */
export async function updateWorkspaceProject(
  c: Tx,
  caller: Caller,
  projectId: string,
  patch: Record<string, unknown>,
): Promise<WorkspaceProjectView> {
  if (patch.mode !== undefined) {
    throw new Refusal(409, "mode-immutable", "A project's engineering mode cannot be changed after creation");
  }
  const actor = { kind: "human" as const, id: caller.userName };
  const r = await c.query<{ body: Record<string, unknown>; created_at: Date }>(
    "select body, created_at from projects where id = $1 and org_id = $2 for update",
    [projectId, caller.orgId],
  );
  if (!r.rows[0]) throw new Refusal(404, "not-found", "No such project");
  if (r.rows[0].body.practice === true) {
    const fixed = Object.keys(patch).filter((k) => patch[k] !== undefined && !PRACTICE_EDITABLE.has(k));
    if (fixed.length) {
      throw new Refusal(409, "practice-fixed", "The practice project keeps its sample, its agents and its settings. Make a project of your own for real work.");
    }
  } else {
    refusePracticePick(agentPicks(patch));
  }
  const map = await readPrefsMap(c, caller.orgId);
  const current = mergePrefs(map[projectId]);
  const { laneAgents: currentLaneAgents, setup: currentSetup, ...baseCurrent } = current;
  const nextLaneAgents =
    patch.laneAgents === null
      ? undefined
      : patch.laneAgents !== undefined
        ? (patch.laneAgents as Record<string, string>)
        : currentLaneAgents;
  const next = mergePrefs({
    ...baseCurrent,
    ...(typeof patch.repo === "string" ? { repo: patch.repo } : {}),
    ...(typeof patch.repoStrategy === "string" ? { repoStrategy: patch.repoStrategy as RepoOutfallStrategy } : {}),
    ...(typeof patch.workspaceRoot === "string" ? { workspaceRoot: patch.workspaceRoot } : {}),
    ...(typeof patch.lane === "string" ? { lane: patch.lane as DataLane } : {}),
    ...(patch.author !== undefined ? { author: patch.author as AgentRuntimeSelection } : {}),
    ...(patch.checker !== undefined ? { checker: patch.checker as AgentRuntimeSelection } : {}),
    ...(nextLaneAgents !== undefined ? { laneAgents: nextLaneAgents } : {}),
    ...((typeof patch.setup === "boolean" ? patch.setup : currentSetup) === false ? { setup: false } : {}),
  });
  // Work lanes live on the project record, beside its other settings, and are checked against the spec.
  const body = r.rows[0].body;
  let lanes = laneSetOf(body.work_lanes);
  if (patch.work_lanes !== undefined) {
    lanes = resolveChoice(patch.work_lanes);
    const nextBody = { ...body, work_lanes: lanes };
    checkSchema("Project.json", nextBody);
    await c.query("update projects set body = $2 where id = $1", [projectId, nextBody]);
  }
  map[projectId] = next;
  await writePrefsMap(c, caller.orgId, map);
  await appendEvent(c, "project.workspace-updated", projectId, actor, {
    repo: next.repo,
    repo_strategy: next.repoStrategy,
    lane: next.lane,
    author: next.author.ecosystem,
    checker: next.checker.ecosystem,
    ...(next.laneAgents ? { lane_agents: next.laneAgents } : {}),
    ...(patch.work_lanes !== undefined ? { work_lanes: lanes.preset } : {}),
    ...(typeof patch.setup === "boolean" ? { setup: patch.setup } : {}),
  });
  return {
    id: projectId,
    name: String(r.rows[0].body.name ?? projectId),
    mode: resolveWorkspaceMode(r.rows[0].body),
    status: String(r.rows[0].body.status ?? "active"),
    ...next,
    work_lanes: lanes,
    ...(r.rows[0].body.practice === true ? { practice: true } : {}),
    createdAt: r.rows[0].created_at instanceof Date ? r.rows[0].created_at.toISOString() : String(r.rows[0].created_at),
  };
}

/** Soft-archives a project (refusing if any package in the project awaits a signature). */
export async function archiveWorkspaceProject(c: Tx, caller: Caller, projectId: string): Promise<{ id: string; status: "archived" }> {
  const actor = { kind: "human" as const, id: caller.userName };
  const r = await c.query<{ body: Record<string, unknown> }>(
    "select body from projects where id = $1 and org_id = $2 for update",
    [projectId, caller.orgId],
  );
  const project = r.rows[0]?.body;
  if (!project) throw new Refusal(404, "not-found", "No such project");
  if (project.status === "retired") return { id: projectId, status: "archived" as const };
  const name = String(project.name ?? "");
  const pending = await c.query<{ count: string }>(
    `select count(*)::text as count from packages p
     join object_owners o on o.object_kind = 'package' and o.object_id = p.id and o.org_id = $1
     where (p.body->>'project' = $2 or lower(p.body->>'project') = lower($3))
       and p.status in ('in-verification', 'awaiting-acceptance')`,
    [caller.orgId, projectId, name],
  );
  if (Number(pending.rows[0]?.count ?? 0) > 0) {
    throw new Refusal(409, "pending-signatures", "Cannot archive a project while packages are awaiting verification or signature");
  }
  const next = { ...project, status: "retired" };
  checkSchema("Project.json", next);
  await c.query("update projects set body = $2 where id = $1", [projectId, next]);
  await appendEvent(c, "project.archived", projectId, actor, { name });
  return { id: projectId, status: "archived" as const };
}
