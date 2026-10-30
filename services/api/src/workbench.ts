import type { Db, Tx } from "./db/index.js";
import { appendEvent, type Actor } from "./events.js";
import { digest } from "./kernel.js";
import { checkSchema } from "./tenancy.js";

/**
 * Storage for workbench objects (specification 5.7 to 5.10). Commands that authorize these writes
 * land in task 1.5; this layer enforces shape, class and lifecycle only. Each object carries its
 * organization (specification 6, Owned); the database derives every link column from the body.
 */

type Cls = "F" | "A" | "L" | "H";
const kind = (table: string, schema: string, cls: Cls) => ({ table, schema, cls });

/** F frozen (digest addressed), A observation, L lifecycled, H Capital Projects hook (identity only). */
export const WORKBENCH = {
  exploration: kind("explorations", "Exploration", "L"),
  workspace: kind("workspaces", "Workspace", "L"),
  checkpoint: kind("checkpoints", "Checkpoint", "A"),
  source_manifest: kind("source_manifests", "SourceManifest", "F"),
  promotion: kind("promotions", "Promotion", "A"),
  attempt_set: kind("attempt_sets", "AttemptSet", "L"),
  candidate_assignment: kind("candidate_assignments", "CandidateAssignment", "F"),
  selection: kind("selections", "Selection", "A"),
  runtime_probe: kind("runtime_probes", "RuntimeProbe", "A"),
  runtime_artifact_version: kind("runtime_artifact_versions", "RuntimeArtifactVersion", "F"),
  runtime_pin: kind("runtime_pins", "RuntimePin", "L"),
  isolation_attestation: kind("isolation_attestations", "IsolationAttestation", "A"),
  controlled_record: kind("controlled_records", "ControlledRecord", "F"),
  person_verification: kind("person_verifications", "PersonVerification", "A"),
  scram_event: kind("scram_events", "ScramEvent", "A"),
  comment: kind("comments", "Comment", "L"),
  resolution: kind("resolutions", "Resolution", "A"),
  change_request: kind("change_requests", "ChangeRequest", "L"),
  budget: kind("budgets", "Budget", "L"),
  usage_record: kind("usage_records", "UsageRecord", "A"),
  budget_reservation: kind("budget_reservations", "BudgetReservation", "L"),
  project_deliverable: kind("project_deliverables", "ProjectDeliverable", "H"),
  deliverable_revision: kind("deliverable_revisions", "DeliverableRevision", "H"),
  interface_record: kind("interface_records", "InterfaceRecord", "H"),
  flow_edge_ref: kind("flow_edge_refs", "FlowEdgeRef", "H"),
  phase_gate: kind("phase_gates", "PhaseGate", "H"),
} as const;
export type WorkbenchKind = keyof typeof WORKBENCH;

type Body = { id: string; org_id: string } & Record<string, unknown>;
const eventName = (k: string) => k.replaceAll("_", "-");

/** Records a new object of any workbench kind. Frozen kinds return their digest. */
export async function recordObject(c: Tx, k: WorkbenchKind, body: Body, actor: Actor): Promise<{ id: string; digest?: string }> {
  const t = WORKBENCH[k];
  checkSchema(`${t.schema}.json`, body);
  if (t.cls === "F") {
    const d = digest(body);
    await c.query(`insert into ${t.table} (body, digest) values ($1, $2)`, [body, d]);
    await appendEvent(c, `${eventName(k)}.recorded`, body.id, actor, { digest: d });
    return { id: body.id, digest: d };
  }
  await c.query(`insert into ${t.table} (body) values ($1)`, [body]);
  const status = t.cls === "L" ? { status: body.status } : {};
  await appendEvent(c, `${eventName(k)}.${t.cls === "L" ? "created" : "recorded"}`, body.id, actor, status);
  return { id: body.id };
}

/** Moves a lifecycled object to a new status. The database refuses any unlisted transition. */
export async function transition(c: Tx, k: WorkbenchKind, id: string, to: string, actor: Actor, reason: string): Promise<void> {
  const t = WORKBENCH[k];
  if (t.cls !== "L") throw new Error(`${k} is not lifecycled`);
  const r = await c.query<{ body: Body & { status: string } }>(`select body from ${t.table} where id = $1 for update`, [id]);
  const body = r.rows[0]?.body;
  if (!body) throw new Error(`${k} ${id} does not exist`);
  const next = { ...body, status: to };
  checkSchema(`${t.schema}.json`, next);
  await c.query(`update ${t.table} set body = $2 where id = $1`, [id, next]);
  await appendEvent(c, `${eventName(k)}.status-changed`, id, actor, { from: body.status, to, reason });
}

export async function getObject<T = Body>(db: Db | Tx, k: WorkbenchKind, id: string): Promise<T | null> {
  const r = await db.query<{ body: T }>(`select body from ${WORKBENCH[k].table} where id = $1`, [id]);
  return r.rows[0]?.body ?? null;
}

/** Records the next version of a sandbox policy. Versions are contiguous; old versions never change. */
export async function recordSandboxPolicy(c: Tx, body: Body & { version: number }, actor: Actor): Promise<{ digest: string }> {
  checkSchema("SandboxPolicy.json", body);
  await c.query("select pg_advisory_xact_lock(hashtext($1))", [`sandbox_policies:${body.id}`]);
  const d = digest(body);
  await c.query("insert into sandbox_policies (body, digest) values ($1, $2)", [body, d]);
  await appendEvent(c, "sandbox-policy.recorded", body.id, actor, { version: body.version, digest: d });
  return { digest: d };
}

export async function currentSandboxPolicy(db: Db | Tx, id: string): Promise<{ body: Body & { version: number }; digest: string } | null> {
  const r = await db.query<{ body: Body & { version: number }; digest: string }>(
    "select body, digest from sandbox_policies where id = $1 order by version desc limit 1",
    [id],
  );
  return r.rows[0] ?? null;
}
