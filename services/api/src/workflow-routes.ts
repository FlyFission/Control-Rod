import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Caller } from "./admin.js";
import { command } from "./commands/executor.js";
import type { Db, Tx } from "./db/index.js";
import { Refusal } from "./refusal.js";
import { setupView } from "./setup.js";
import { projectRuntimePrefs } from "./workspace-projects.js";
import {
  WORKFLOW_SPEC_VERSION,
  buildCatalog,
  buildPresetSpec,
  createCustomPackLane,
  exportCustomPack,
  importCustomPackJson,
  importSkillsFromRepoUrl,
  mergeLaneUpdate,
  parseLaneSpec,
  parseWorkflowSpec,
  resolveLaneConflict,
  rollbackLane,
  syncStageSkillsFromLaneUpdate,
  validateWorkflowSpec,
  type ContextDepth,
  type CouncilSeats,
  type LaneSkillEntry,
  type RepoFetcher,
  type WorkflowLaneSpec,
  type WorkflowPreset,
  type WorkflowSpecV1,
} from "./workflow-spec.js";

export type WorkflowScopeKind = "project" | "package" | "default";

const VALID_SCOPES = new Set<WorkflowScopeKind>(["project", "package", "default"]);

function parseScope(
  scopeRaw: unknown,
  idRaw: unknown,
  projectIdRaw?: unknown,
  packageIdRaw?: unknown,
): { scope: WorkflowScopeKind; id: string } {
  if (typeof scopeRaw !== "string" || !scopeRaw) {
    if (typeof packageIdRaw === "string" && packageIdRaw.trim()) {
      return { scope: "package", id: packageIdRaw.trim() };
    }
    if (typeof projectIdRaw === "string" && projectIdRaw.trim()) {
      return { scope: "project", id: projectIdRaw.trim() };
    }
  }
  const scope = (typeof scopeRaw === "string" && scopeRaw ? scopeRaw : "default") as WorkflowScopeKind;
  if (!VALID_SCOPES.has(scope)) {
    throw new Refusal(400, "invalid-scope", `Scope must be one of: project, package, default`);
  }
  const fallbackId = scope === "package" ? packageIdRaw : scope === "project" ? projectIdRaw : undefined;
  const rawId = typeof idRaw === "string" && idRaw.trim() ? idRaw : fallbackId;
  const id = typeof rawId === "string" && rawId.trim() ? rawId.trim() : scope === "default" ? "default" : "";
  if (!id) {
    throw new Refusal(400, "invalid-scope", `A non-empty id is required for scope "${scope}"`);
  }
  return { scope, id };
}

async function resolveServerCouncil(
  db: Db | Tx,
  orgId: string,
  scope: WorkflowScopeKind,
  id: string,
  clientCouncil?: CouncilSeats,
): Promise<CouncilSeats> {
  let author: string | null = clientCouncil?.author ?? null;
  let checker: string | null = clientCouncil?.checker ?? null;
  let intake: string | null = clientCouncil?.intake ?? null;

  const setup = await setupView(db);
  const seated = setup.seats.filter((s) => s.seated).map((s) => s.runtime);
  if (!author && seated[0]) author = seated[0];
  if (!intake && author) intake = author;
  if (!checker && author) checker = seated.find((r) => r !== author) ?? null;

  let projectId: string | null = scope === "project" ? id : null;
  if (scope === "package") {
    const pkgRow = await db.query<{ project: string | null }>(
      `select p.body->>'project' as project
         from packages p
         join object_owners o on o.object_kind = 'package' and o.object_id = p.id and o.org_id = $2
        where p.id = $1
        order by p.revision desc
        limit 1`,
      [id, orgId],
    );
    projectId = pkgRow.rows[0]?.project ?? null;
  }
  if (projectId) {
    const prefs = await projectRuntimePrefs(db, orgId, projectId);
    if (prefs) {
      const pAuthor = prefs.laneAgents?.drafting ?? prefs.author;
      const pChecker = prefs.laneAgents?.["agent-check"] ?? prefs.checker;
      if (pAuthor) author = pAuthor;
      if (pChecker) checker = pChecker;
    }
  }
  return { author, checker, intake };
}

/** Reads a saved WorkflowSpecV1 for (orgId, scopeKind, scopeId), or null if none is stored. */
export async function loadSavedWorkflowSpec(
  db: Db | Tx,
  orgId: string,
  scopeKind: WorkflowScopeKind,
  scopeId: string,
): Promise<WorkflowSpecV1 | null> {
  const r = await db.query<{ body: unknown }>(
    "select body from workflow_specs where org_id = $1 and scope_kind = $2 and scope_id = $3",
    [orgId, scopeKind, scopeId],
  );
  if (!r.rows[0]) return null;
  return parseWorkflowSpec(r.rows[0].body);
}

/** Loads all org-scoped custom packs as WorkflowLaneSpec[]. */
export async function loadOrgCustomPacks(db: Db | Tx, orgId: string): Promise<WorkflowLaneSpec[]> {
  const r = await db.query<{ body: unknown }>(
    "select body from workflow_custom_packs where org_id = $1 order by name asc, id asc",
    [orgId],
  );
  const packs: WorkflowLaneSpec[] = [];
  for (const row of r.rows) {
    try {
      packs.push(parseLaneSpec(row.body));
    } catch {
      // Skip corrupted legacy rows rather than breaking catalog load
    }
  }
  return packs;
}

async function saveWorkflowSpecRow(
  db: Db,
  orgId: string,
  scope: WorkflowScopeKind,
  id: string,
  spec: WorkflowSpecV1,
): Promise<WorkflowSpecV1> {
  const saved: WorkflowSpecV1 = { ...spec, updatedAt: new Date().toISOString() };
  await command(db, "workflow.spec-save", async (c) => {
    await c.query(
      `insert into workflow_specs (scope_kind, scope_id, org_id, schema_version, body, updated_at)
       values ($1, $2, $3, $4, $5::jsonb, now())
       on conflict (org_id, scope_kind, scope_id)
       do update set schema_version = excluded.schema_version, body = excluded.body, updated_at = now()`,
      [scope, id, orgId, WORKFLOW_SPEC_VERSION, JSON.stringify(saved)],
    );
  });
  return saved;
}

async function saveCustomPackRow(db: Db, orgId: string, lane: WorkflowLaneSpec): Promise<WorkflowLaneSpec> {
  await command(db, "workflow.pack-save", async (c) => {
    await c.query(
      `insert into workflow_custom_packs (id, org_id, name, body, updated_at)
       values ($1, $2, $3, $4::jsonb, now())
       on conflict (org_id, id)
       do update set name = excluded.name, body = excluded.body, updated_at = now()`,
      [lane.id, orgId, lane.name, JSON.stringify(lane)],
    );
  });
  return lane;
}

export interface WorkflowRoutesOptions {
  fetcher?: RepoFetcher;
}

export function workflowRoutes(
  app: FastifyInstance,
  db: Db,
  rootDir: string,
  getCaller: (req: FastifyRequest) => Promise<Caller>,
  opts: WorkflowRoutesOptions = {},
): void {
  /* ---- GET /workflows/catalog ---- */
  app.get("/workflows/catalog", async (req) => {
    const caller = await getCaller(req);
    const customLanes = await loadOrgCustomPacks(db, caller.orgId);
    const catalog = buildCatalog(rootDir, customLanes);
    return {
      ...catalog,
      lanes: [...catalog.workflowLanes, ...catalog.contextLanes, ...catalog.customLanes],
    };
  });

  /* ---- GET /workflows/spec ---- */
  app.get<{
    Querystring: { scope?: string; id?: string; project_id?: string; package_id?: string; preset?: string; contextDepth?: string };
  }>("/workflows/spec", async (req) => {
    const caller = await getCaller(req);
    const { scope, id } = parseScope(req.query.scope, req.query.id, req.query.project_id, req.query.package_id);
    const council = await resolveServerCouncil(db, caller.orgId, scope, id);

    const saved = await loadSavedWorkflowSpec(db, caller.orgId, scope, id);
    if (saved) {
      return { spec: saved, saved: true, source: "saved" as const, validation: validateWorkflowSpec(saved, council) };
    }

    // Package falls back to its project's saved spec if present (scoped to caller's org)
    let preset: WorkflowPreset = "playbook";
    let contextDepth: ContextDepth = "light";

    if (scope === "package") {
      const pkgRow = await db.query<{ body: Record<string, unknown> }>(
        `select p.body
           from packages p
           join object_owners o on o.object_kind = 'package' and o.object_id = p.id and o.org_id = $2
          where p.id = $1
          order by p.revision desc
          limit 1`,
        [id, caller.orgId],
      );
      const projectId = typeof pkgRow.rows[0]?.body?.project === "string" ? pkgRow.rows[0].body.project : null;
      if (projectId) {
        const projSpec = await loadSavedWorkflowSpec(db, caller.orgId, "project", projectId);
        if (projSpec) {
          return { spec: projSpec, saved: false, source: "inherited" as const, validation: validateWorkflowSpec(projSpec, council) };
        }
        const projRow = await db.query<{ body: Record<string, unknown> }>(
          "select body from projects where org_id = $1 and id = $2",
          [caller.orgId, projectId],
        );
        const dw = projRow.rows[0]?.body?.default_workflow;
        if (dw === "superpowers" || dw === "pocock" || dw === "pocock-superpowers" || dw === "playbook") preset = dw;
        const dc = projRow.rows[0]?.body?.default_context_profile;
        if (dc === "nuclear" || dc === "light") contextDepth = dc;
      }
      const pw = pkgRow.rows[0]?.body?.workflow;
      if (pw === "superpowers" || pw === "pocock" || pw === "pocock-superpowers" || pw === "playbook") preset = pw;
      const pc = pkgRow.rows[0]?.body?.context_profile;
      if (pc === "nuclear" || pc === "light") contextDepth = pc;
    } else if (scope === "project") {
      const projRow = await db.query<{ body: Record<string, unknown> }>(
        "select body from projects where org_id = $1 and id = $2",
        [caller.orgId, id],
      );
      const dw = projRow.rows[0]?.body?.default_workflow;
      if (dw === "superpowers" || dw === "pocock" || dw === "pocock-superpowers" || dw === "playbook") preset = dw;
      const dc = projRow.rows[0]?.body?.default_context_profile;
      if (dc === "nuclear" || dc === "light") contextDepth = dc;
    }

    if (
      req.query.preset === "playbook" ||
      req.query.preset === "superpowers" ||
      req.query.preset === "pocock" ||
      req.query.preset === "pocock-superpowers" ||
      req.query.preset === "custom"
    ) {
      preset = req.query.preset;
    }
    if (req.query.contextDepth === "light" || req.query.contextDepth === "nuclear") {
      contextDepth = req.query.contextDepth;
    }

    const customLanes = await loadOrgCustomPacks(db, caller.orgId);
    const catalog = buildCatalog(rootDir, customLanes);
    const spec = buildPresetSpec(preset, contextDepth, catalog);
    return { spec, saved: false, source: "preset" as const, validation: validateWorkflowSpec(spec, council) };
  });

  /* ---- PUT /workflows/spec ---- */
  app.put<{
    Querystring: { scope?: string; id?: string; project_id?: string; package_id?: string };
    Body: { scope?: string; id?: string; project_id?: string; package_id?: string; spec?: unknown; council?: CouncilSeats };
  }>("/workflows/spec", async (req, reply) => {
    const caller = await getCaller(req);
    const { scope, id } = parseScope(
      req.body?.scope ?? req.query.scope,
      req.body?.id ?? req.query.id,
      req.body?.project_id ?? req.query.project_id,
      req.body?.package_id ?? req.query.package_id,
    );

    let spec: WorkflowSpecV1;
    try {
      spec = parseWorkflowSpec(req.body?.spec ?? req.body);
    } catch (e) {
      return reply.code(400).send({ code: "invalid-workflow-spec", message: (e as Error).message });
    }

    const council = await resolveServerCouncil(db, caller.orgId, scope, id, req.body?.council);
    const validation = validateWorkflowSpec(spec, council);
    if (!validation.valid) {
      return reply.code(400).send({
        code: "workflow-rule-violation",
        message: validation.errors.map((e) => e.message).join("; "),
        errors: validation.errors,
        warnings: validation.warnings,
      });
    }

    const saved = await saveWorkflowSpecRow(db, caller.orgId, scope, id, spec);
    return { spec: saved, saved: true, validation };
  });

  /* ---- POST /workflows/lanes/import ---- */
  app.post<{ Body: { url?: string; name?: string; save?: boolean } }>("/workflows/lanes/import", async (req, reply) => {
    const caller = await getCaller(req);
    const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    if (!url) {
      return reply.code(400).send({ code: "invalid-url", message: "Repository URL is required." });
    }
    try {
      const imported = await importSkillsFromRepoUrl(url, opts.fetcher);
      const customName = typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : null;
      const lane = customName ? { ...imported, name: customName } : imported;
      if (req.body?.save === true) {
        await saveCustomPackRow(db, caller.orgId, lane);
      }
      return reply.code(201).send({ lane });
    } catch (e) {
      return reply.code(400).send({ code: "lane-import-failed", message: (e as Error).message });
    }
  });

  /* ---- POST /workflows/lanes/update-check ---- */
  app.post<{
    Body: {
      scope?: string;
      id?: string;
      project_id?: string;
      package_id?: string;
      spec?: unknown;
      laneId?: string;
      lane_id?: string;
      upstreamOverrides?: Record<string, { commit: string; digest: string; skills: LaneSkillEntry[] }>;
    };
  }>("/workflows/lanes/update-check", async (req, reply) => {
    const caller = await getCaller(req);
    const hasScope = Boolean(req.body?.scope || req.body?.id || req.body?.project_id || req.body?.package_id);
    const parsedScope = hasScope
      ? parseScope(req.body?.scope, req.body?.id, req.body?.project_id, req.body?.package_id)
      : null;

    const customLanes = await loadOrgCustomPacks(db, caller.orgId);
    const catalog = buildCatalog(rootDir, customLanes);

    let spec: WorkflowSpecV1 | null = null;
    if (req.body?.spec) {
      try {
        spec = parseWorkflowSpec(req.body.spec);
      } catch (e) {
        return reply.code(400).send({ code: "invalid-workflow-spec", message: (e as Error).message });
      }
    } else if (parsedScope) {
      spec = await loadSavedWorkflowSpec(db, caller.orgId, parsedScope.scope, parsedScope.id);
      if (!spec) {
        spec = buildPresetSpec("superpowers", "light", catalog);
      }
    }

    if (!spec) {
      return reply.code(404).send({ code: "not-found", message: "No workflow spec found to check for updates." });
    }

    const catalogById = new Map<string, WorkflowLaneSpec>([
      ...catalog.workflowLanes.map((l) => [l.id, l] as const),
      ...catalog.contextLanes.map((l) => [l.id, l] as const),
    ]);

    const targetLaneId = req.body?.laneId ?? req.body?.lane_id;
    const results: { laneId: string; status: string; summary: string }[] = [];
    let changed = false;

    let nextStages = spec.stages;
    const updatedLanes: WorkflowLaneSpec[] = [];
    for (const lane of spec.lanes) {
      if (targetLaneId && lane.id !== targetLaneId) {
        updatedLanes.push(lane);
        continue;
      }
      if (lane.updatePolicy === "freeze") {
        results.push({ laneId: lane.id, status: "frozen", summary: `Lane "${lane.name}" is frozen; skipped update.` });
        updatedLanes.push(lane);
        continue;
      }

      let upstream = req.body?.upstreamOverrides?.[lane.id];
      if (!upstream && lane.source.type === "builtin") {
        const cat = catalogById.get(lane.id);
        if (cat && !cat.packError) {
          upstream = { commit: cat.source.commit, digest: cat.source.digest, skills: cat.nativeSkills };
        }
      } else if (!upstream && lane.source.type === "git-url" && lane.source.url) {
        try {
          const fresh = await importSkillsFromRepoUrl(lane.source.url, opts.fetcher);
          upstream = { commit: fresh.source.commit, digest: fresh.source.digest, skills: fresh.nativeSkills };
        } catch (e) {
          results.push({ laneId: lane.id, status: "error", summary: (e as Error).message });
          updatedLanes.push(lane);
          continue;
        }
      }

      if (!upstream) {
        results.push({ laneId: lane.id, status: "up_to_date", summary: "No upstream source to check." });
        updatedLanes.push(lane);
        continue;
      }

      const merged = mergeLaneUpdate(lane, upstream);
      results.push({ laneId: lane.id, status: merged.status, summary: merged.summary });
      updatedLanes.push(merged.lane);
      if (merged.status === "updated") {
        nextStages = syncStageSkillsFromLaneUpdate(nextStages, merged.lane);
      }
      if (merged.status !== "up_to_date") changed = true;
    }

    let nextSpec: WorkflowSpecV1 = { ...spec, lanes: updatedLanes, stages: nextStages };
    if (changed && parsedScope) {
      const existing = await loadSavedWorkflowSpec(db, caller.orgId, parsedScope.scope, parsedScope.id);
      if (existing) {
        nextSpec = await saveWorkflowSpecRow(db, caller.orgId, parsedScope.scope, parsedScope.id, nextSpec);
      }
    }

    const council = parsedScope
      ? await resolveServerCouncil(db, caller.orgId, parsedScope.scope, parsedScope.id)
      : await resolveServerCouncil(db, caller.orgId, "default", "default");
    const upToDate = results.every((r) => r.status === "up_to_date" || r.status === "frozen");
    return { upToDate, spec: nextSpec, results, validation: validateWorkflowSpec(nextSpec, council) };
  });

  /* ---- POST /workflows/lanes/resolve-conflict ---- */
  app.post<{
    Body: {
      scope?: string;
      id?: string;
      project_id?: string;
      package_id?: string;
      spec?: unknown;
      laneId?: string;
      lane_id?: string;
      resolutions?: Record<string, "mine" | "upstream">;
    };
  }>("/workflows/lanes/resolve-conflict", async (req, reply) => {
    const caller = await getCaller(req);
    const hasScope = Boolean(req.body?.scope || req.body?.id || req.body?.project_id || req.body?.package_id);
    const parsedScope = hasScope
      ? parseScope(req.body?.scope, req.body?.id, req.body?.project_id, req.body?.package_id)
      : null;
    const laneId = typeof (req.body?.laneId ?? req.body?.lane_id) === "string" ? String(req.body?.laneId ?? req.body?.lane_id) : "";
    if (!laneId) return reply.code(400).send({ code: "invalid-request", message: "laneId is required." });

    let spec: WorkflowSpecV1 | null = null;
    if (req.body?.spec) {
      try {
        spec = parseWorkflowSpec(req.body.spec);
      } catch (e) {
        return reply.code(400).send({ code: "invalid-workflow-spec", message: (e as Error).message });
      }
    } else if (parsedScope) {
      spec = await loadSavedWorkflowSpec(db, caller.orgId, parsedScope.scope, parsedScope.id);
    }
    if (!spec) return reply.code(404).send({ code: "not-found", message: "Workflow spec not found." });

    const idx = spec.lanes.findIndex((l) => l.id === laneId);
    if (idx < 0) return reply.code(404).send({ code: "not-found", message: `Lane "${laneId}" not found.` });

    try {
      const resolved = resolveLaneConflict(spec.lanes[idx]!, req.body?.resolutions ?? {});
      const nextLanes = [...spec.lanes];
      nextLanes[idx] = resolved;
      let nextSpec: WorkflowSpecV1 = {
        ...spec,
        lanes: nextLanes,
        stages: syncStageSkillsFromLaneUpdate(spec.stages, resolved),
      };
      if (parsedScope) {
        nextSpec = await saveWorkflowSpecRow(db, caller.orgId, parsedScope.scope, parsedScope.id, nextSpec);
      }
      const council = parsedScope
        ? await resolveServerCouncil(db, caller.orgId, parsedScope.scope, parsedScope.id)
        : await resolveServerCouncil(db, caller.orgId, "default", "default");
      return { ok: true, spec: nextSpec, lane: resolved, validation: validateWorkflowSpec(nextSpec, council) };
    } catch (e) {
      return reply.code(400).send({ code: "conflict-resolution-failed", message: (e as Error).message });
    }
  });

  /* ---- POST /workflows/lanes/rollback ---- */
  app.post<{
    Body: {
      scope?: string;
      id?: string;
      project_id?: string;
      package_id?: string;
      spec?: unknown;
      laneId?: string;
      lane_id?: string;
      targetVersion?: number;
      version?: number;
    };
  }>("/workflows/lanes/rollback", async (req, reply) => {
    const caller = await getCaller(req);
    const hasScope = Boolean(req.body?.scope || req.body?.id || req.body?.project_id || req.body?.package_id);
    const parsedScope = hasScope
      ? parseScope(req.body?.scope, req.body?.id, req.body?.project_id, req.body?.package_id)
      : null;
    const laneId = typeof (req.body?.laneId ?? req.body?.lane_id) === "string" ? String(req.body?.laneId ?? req.body?.lane_id) : "";
    if (!laneId) return reply.code(400).send({ code: "invalid-request", message: "laneId is required." });

    let spec: WorkflowSpecV1 | null = null;
    if (req.body?.spec) {
      try {
        spec = parseWorkflowSpec(req.body.spec);
      } catch (e) {
        return reply.code(400).send({ code: "invalid-workflow-spec", message: (e as Error).message });
      }
    } else if (parsedScope) {
      spec = await loadSavedWorkflowSpec(db, caller.orgId, parsedScope.scope, parsedScope.id);
    }
    if (!spec) return reply.code(404).send({ code: "not-found", message: "Workflow spec not found." });

    const idx = spec.lanes.findIndex((l) => l.id === laneId);
    if (idx < 0) return reply.code(404).send({ code: "not-found", message: `Lane "${laneId}" not found.` });

    try {
      const rolled = rollbackLane(spec.lanes[idx]!, req.body?.targetVersion ?? req.body?.version);
      const nextLanes = [...spec.lanes];
      nextLanes[idx] = rolled;
      let nextSpec: WorkflowSpecV1 = {
        ...spec,
        lanes: nextLanes,
        stages: syncStageSkillsFromLaneUpdate(spec.stages, rolled),
      };
      if (parsedScope) {
        nextSpec = await saveWorkflowSpecRow(db, caller.orgId, parsedScope.scope, parsedScope.id, nextSpec);
      }
      const council = parsedScope
        ? await resolveServerCouncil(db, caller.orgId, parsedScope.scope, parsedScope.id)
        : await resolveServerCouncil(db, caller.orgId, "default", "default");
      return { ok: true, spec: nextSpec, lane: rolled, validation: validateWorkflowSpec(nextSpec, council) };
    } catch (e) {
      return reply.code(400).send({ code: "rollback-failed", message: (e as Error).message });
    }
  });

  /* ---- GET /workflows/packages/:id/log ---- */
  app.get<{ Params: { id: string } }>("/workflows/packages/:id/log", async (req) => {
    const caller = await getCaller(req);
    const pkgId = req.params.id;
    const rows = (
      await db.query<{ id: string; body: Record<string, unknown>; at: string }>(
        `select e.id, e.body, e.at::text as at
           from events e
           join object_owners o on o.object_kind = 'package' and o.object_id = $1 and o.org_id = $2
          where e.body->>'type' = 'run.workflow'
            and e.body->'data'->>'package' = $1
          order by e.seq desc
          limit 25`,
        [pkgId, caller.orgId],
      )
    ).rows;
    return {
      packageId: pkgId,
      runs: rows.map((r) => ({
        eventId: r.id,
        at: r.at,
        ...(typeof r.body?.data === "object" && r.body.data ? (r.body.data as Record<string, unknown>) : {}),
      })),
    };
  });

  /* ---- Custom packs ---- */
  app.get("/workflows/packs", async (req) => {
    const caller = await getCaller(req);
    const packs = await loadOrgCustomPacks(db, caller.orgId);
    return { packs };
  });

  app.post<{
    Body: { id?: string; name?: string; fromLane?: WorkflowLaneSpec; skills?: LaneSkillEntry[]; lane?: unknown; pack?: unknown };
  }>("/workflows/packs", async (req, reply) => {
    const caller = await getCaller(req);
    try {
      const rawLane = req.body?.lane ?? req.body?.pack;
      const lane = rawLane
        ? parseLaneSpec(rawLane, "pack")
        : createCustomPackLane({
            id:
              typeof req.body?.id === "string" && req.body.id.trim()
                ? req.body.id.trim()
                : String(req.body?.name ?? "")
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "-")
                    .replace(/^-|-$/g, "") || `custom-${Date.now()}`,
            name: String(req.body?.name ?? ""),
            ...(req.body?.fromLane ? { fromLane: parseLaneSpec(req.body.fromLane, "fromLane") } : {}),
            ...(req.body?.skills ? { skills: req.body.skills } : {}),
          });
      const saved = await saveCustomPackRow(db, caller.orgId, lane);
      return reply.code(201).send({ ok: true, pack: saved, lane: saved });
    } catch (e) {
      return reply.code(400).send({ code: "invalid-custom-pack", message: (e as Error).message });
    }
  });

  app.get<{ Params: { id: string } }>("/workflows/packs/:id/export", async (req, reply) => {
    const caller = await getCaller(req);
    const r = await db.query<{ body: unknown }>(
      "select body from workflow_custom_packs where org_id = $1 and id = $2",
      [caller.orgId, req.params.id],
    );
    if (r.rows[0]) {
      return exportCustomPack(parseLaneSpec(r.rows[0].body));
    }
    const catalog = buildCatalog(rootDir);
    const builtin = [...catalog.workflowLanes, ...catalog.contextLanes].find((l) => l.id === req.params.id);
    if (builtin) {
      return exportCustomPack(builtin);
    }
    return reply.code(404).send({ code: "not-found", message: `Pack "${req.params.id}" not found.` });
  });

  app.post("/workflows/packs/import", async (req, reply) => {
    const caller = await getCaller(req);
    try {
      const lane = importCustomPackJson(req.body);
      const saved = await saveCustomPackRow(db, caller.orgId, lane);
      return reply.code(201).send({ ok: true, pack: saved, lane: saved });
    } catch (e) {
      return reply.code(400).send({ code: "invalid-custom-pack", message: (e as Error).message });
    }
  });
}
