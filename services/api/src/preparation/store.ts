import { randomUUID } from "node:crypto";
import type { Ajv2020 } from "ajv/dist/2020.js";
import { type Db, type Tx, tx } from "../db/index.js";
import { type Actor, appendEvent } from "../events.js";
import { digest } from "../kernel.js";
import { currentPackage, Refusal, type PackageRow } from "../work.js";
import {
  packageContract,
  preparationReadiness,
  preparationSubjects,
} from "./readiness.js";
import type {
  PreparationContent,
  PreparationSnapshot,
  PreparationView,
  ResolutionRequest,
  WorkPackage,
} from "./types.js";

type Config = { ajv: Ajv2020 };
const actor = (id: string) => ({ kind: "human" as const, id });
export function preparationContent(s: PreparationSnapshot): PreparationContent {
  const {
    request_kind,
    package_contract,
    requirements,
    criteria,
    context,
    questions,
    resolutions,
    escalations,
    technical_plan,
    basis,
  } = structuredClone(s);
  return {
    request_kind,
    package_contract,
    requirements,
    criteria,
    context,
    questions,
    resolutions,
    escalations,
    technical_plan,
    basis,
  };
}
function validate(cfg: Config, schema: string, v: unknown): void {
  if (!cfg.ajv.validate(schema, v))
    throw new Refusal(400, "invalid", `${schema}: ${cfg.ajv.errorsText()}`);
}
async function lockedPackage(c: Tx, id: string): Promise<PackageRow> {
  const p = await currentPackage(c, id, true);
  if (!p) throw new Refusal(404, "not-found", "No such package");
  return p;
}
function editable(p: PackageRow) {
  if (p.status !== "draft")
    throw new Refusal(409, "wrong-state", "Preparation can only edit a draft");
}
async function head(c: Tx, id: string): Promise<PreparationSnapshot | null> {
  const r = await c.query<{ body: PreparationSnapshot }>(
    "select s.body from preparation_heads h join preparation_snapshots s on s.preparation_id=h.preparation_id and s.revision=h.revision where h.package_id=$1 for update of h",
    [id],
  );
  return r.rows[0]?.body ?? null;
}
function view(s: PreparationSnapshot, p: PackageRow): PreparationView {
  const blockers = preparationReadiness(
    s,
    { ...p.body, status: p.status } as WorkPackage,
    false,
  );
  blockers.push({
    code: "prepared-release-disabled",
    message:
      "Preparation is saved. Signed confirmation and prepared release are not enabled yet.",
    owner: "owner",
  });
  return {
    snapshot: s,
    ...preparationSubjects(s),
    confirmed: false,
    readiness: "blocked",
    blockers,
    change_summary:
      s.revision === 0
        ? "Preparation enrolled"
        : `Preparation revision ${s.revision}`,
  };
}
function cas(s: PreparationSnapshot, expected: string | undefined) {
  if (expected === undefined)
    throw new Refusal(
      428,
      "precondition-required",
      "Supply the current strong ETag in If-Match",
    );
  if (expected !== `"${preparationSubjects(s).content_digest.value}"`)
    throw new Refusal(
      409,
      "stale",
      "Preparation changed. Reload and compare before saving.",
    );
}
async function save(
  c: Tx,
  cfg: Config,
  p: PackageRow,
  s: PreparationSnapshot,
  type: string,
) {
  validate(cfg, "PreparationSnapshot.json", s);
  const subjects = preparationSubjects(s);
  await c.query(
    "insert into preparation_snapshots(preparation_id,revision,package_id,package_revision,content_digest,requirements_digest,body,created_at) values($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      s.id,
      s.revision,
      s.package_id,
      s.package_revision,
      subjects.content_digest.value,
      subjects.requirements_digest.value,
      s,
      s.created_at,
    ],
  );
  await c.query(
    "insert into preparation_heads(package_id,preparation_id,revision) values($1,$2,$3) on conflict(package_id) do update set revision=excluded.revision",
    [p.id, s.id, s.revision],
  );
  await appendEvent(c, type, p.id, s.created_by, {
    preparation_id: s.id,
    preparation_revision: s.revision,
    content_digest: subjects.content_digest,
  });
  return view(s, p);
}
export async function enrollPreparation(
  db: Db,
  cfg: Config,
  user: string,
  id: string,
  request: { package_revision: number; idempotency_key: string },
) {
  return tx(db, (c) => enrollPreparationTx(c, cfg, actor(user), id, request));
}
/** Intake shares its existing transaction; automatic drafts carry a system actor, never a human confirmation. */
export async function enrollPreparationTx(
  c: Tx,
  cfg: Config,
  createdBy: Actor,
  id: string,
  request: { package_revision: number; idempotency_key: string },
) {
  validate(cfg, "PreparationEnrollment.json", request);
  const p = await lockedPackage(c, id);
  editable(p);
  if (p.revision !== request.package_revision)
    throw new Refusal(409, "stale", "Package revision changed");
  const previous = await head(c, id);
  if (previous) {
    const key = (
      await c.query<{ idempotency_key: string; request_digest: string }>(
        "select * from preparation_enrollments where package_id=$1",
        [id],
      )
    ).rows[0];
    if (
      key?.idempotency_key !== request.idempotency_key ||
      key.request_digest !== digest(request)
    )
      throw new Refusal(
        409,
        "already-enrolled",
        "This package already has preparation; read its current head.",
      );
    return view(previous, p);
  }
  const pkg = { ...p.body, status: p.status } as WorkPackage;
  const capture = p.capture_id
    ? (await c.query("select body from captures where id=$1", [p.capture_id]))
        .rows[0]?.body
    : null;
  const source = capture
    ? {
        kind: "capture" as const,
        reference: `capture:${p.capture_id}`,
        revision: "0",
        digest: { algorithm: "sha256" as const, value: digest(capture) },
      }
    : {
        kind: "package" as const,
        reference: `package:${id}`,
        revision: String(p.revision),
        digest: { algorithm: "sha256" as const, value: digest(pkg) },
      };
  const s: PreparationSnapshot = {
    schema_version: "0.1.0",
    id: `P-${randomUUID()}`,
    package_id: id,
    package_revision: p.revision,
    revision: 0,
    request_kind:
      pkg.mode === "capital-projects" ? "capital-projects" : "general",
    package_contract: packageContract(pkg),
    requirements: [
      {
        id: "REQ-1",
        statement: pkg.objective,
        source_refs: [source.reference],
        journey_or_repro_refs: [],
      },
    ],
    criteria: pkg.acceptance_criteria.map((statement, i) => ({
      id: `AC-${i + 1}`,
      statement,
      requirement_ids: ["REQ-1"],
      verification_check_ids: [],
    })),
    context: { problem: capture?.text ?? pkg.objective },
    questions: [],
    resolutions: [],
    escalations: [],
    technical_plan: {
      summary: "",
      current_state_refs: [source.reference],
      design_elements: [],
      alternatives: [],
      tasks: [],
      checks: [],
      rollout: "",
      risks: [],
    },
    basis: [source],
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };
  const out = await save(c, cfg, p, s, "preparation.enrolled");
  await c.query(
    "insert into preparation_enrollments(package_id,idempotency_key,request_digest) values($1,$2,$3)",
    [id, request.idempotency_key, digest(request)],
  );
  return out;
}
export async function readPreparation(
  db: Db,
  id: string,
): Promise<PreparationView> {
  return tx(db, async (c) => {
    const p = await lockedPackage(c, id);
    const s = await head(c, id);
    if (!s)
      throw new Refusal(404, "not-enrolled", "This package has no preparation");
    return view(s, p);
  });
}
function preserveResolutions(
  next: PreparationContent,
  prev: PreparationSnapshot,
) {
  if (digest(next.resolutions) !== digest(prev.resolutions))
    throw new Refusal(
      403,
      "human-resolution-required",
      "Use the human resolution action; recorded actors and resolutions are immutable.",
    );
  for (const q of next.questions) {
    const old = prev.questions.find((v) => v.id === q.id);
    if (old?.state === "resolved" && digest(q) !== digest(old))
      throw new Refusal(
        403,
        "resolved-item-immutable",
        "Create a new question when a resolved question changes",
      );
    if (
      q.state !== (old?.state ?? "open") ||
      digest(q.resolution_refs) !== digest(old?.resolution_refs ?? [])
    )
      throw new Refusal(
        403,
        "human-resolution-required",
        "Resolve questions through the human resolution action.",
      );
  }
  for (const e of next.escalations) {
    const old = prev.escalations.find((v) => v.id === e.id);
    if (old?.resolution_refs.length && digest(e) !== digest(old))
      throw new Refusal(
        403,
        "resolved-item-immutable",
        "Create a new escalation when its resolved basis changes",
      );
    if (digest(e.resolution_refs) !== digest(old?.resolution_refs ?? []))
      throw new Refusal(
        403,
        "human-resolution-required",
        "Resolve escalations through the human resolution action.",
      );
  }
}
async function appendEdit(
  c: Tx,
  cfg: Config,
  user: string,
  p: PackageRow,
  prev: PreparationSnapshot,
  content: PreparationContent,
  type: string,
) {
  if (prev.package_revision !== p.revision)
    throw new Refusal(
      409,
      "stale",
      "Preparation needs a controlled revision refresh.",
    );
  // The existing draft editor cannot change verifier assignment. Preserve that boundary here too.
  if (
    digest(content.package_contract.verification) !==
    digest(p.body.verification)
  )
    throw new Refusal(
      403,
      "verification-controlled",
      "Verification assignment remains controlled by the package lifecycle.",
    );
  const items = [
    ...content.requirements,
    ...content.criteria,
    ...content.questions,
    ...content.escalations,
    ...content.resolutions,
    ...content.technical_plan.tasks,
    ...content.technical_plan.design_elements,
    ...content.technical_plan.checks,
  ];
  if (new Set(items.map((v) => v.id)).size !== items.length)
    throw new Refusal(
      400,
      "duplicate-id",
      "Preparation IDs must be unique across item kinds",
    );
  if (
    content.criteria.some((v) =>
      prev.requirements.some((r) => r.id === v.id),
    ) ||
    content.requirements.some((v) => prev.criteria.some((r) => r.id === v.id))
  )
    throw new Refusal(
      409,
      "id-kind",
      "Stable requirement and criterion IDs cannot change kind",
    );
  const history = (
    await c.query<{ body: PreparationSnapshot }>(
      "select body from preparation_snapshots where preparation_id=$1 order by revision",
      [prev.id],
    )
  ).rows.map((r) => r.body);
  const ids = (s: Pick<PreparationContent, "requirements" | "criteria">) =>
    [...s.requirements, ...s.criteria].map((v) => v.id);
  const retired = new Set(
    history.flatMap(ids).filter((id) => !ids(prev).includes(id)),
  );
  if (ids(content).some((id) => retired.has(id)))
    throw new Refusal(
      409,
      "retired-id",
      "Retired requirement and criterion IDs cannot be reused.",
    );
  // Identity, status, assignments and metadata stay server-owned.
  const pkg = {
    ...p.body,
    ...content.package_contract,
    acceptance_criteria: content.criteria.map((v) => v.statement),
  } as WorkPackage;
  validate(cfg, "WorkPackage.json", pkg);
  const s: PreparationSnapshot = {
    ...content,
    schema_version: "0.1.0",
    id: prev.id,
    package_id: p.id,
    package_revision: p.revision,
    revision: prev.revision + 1,
    previous_digest: preparationSubjects(prev).content_digest,
    created_by: actor(user),
    created_at: new Date().toISOString(),
  };
  await c.query(
    "update packages set body=$3,updated_at=now() where id=$1 and revision=$2",
    [p.id, p.revision, pkg],
  );
  return save(c, cfg, { ...p, body: pkg }, s, type);
}
export async function editPreparation(
  db: Db,
  cfg: Config,
  user: string,
  id: string,
  content: PreparationContent,
  expected: string | undefined,
) {
  validate(cfg, "PreparationContent.json", content);
  return tx(db, async (c) => {
    const p = await lockedPackage(c, id);
    editable(p);
    const prev = await head(c, id);
    if (!prev)
      throw new Refusal(404, "not-enrolled", "Enroll preparation first");
    cas(prev, expected);
    preserveResolutions(content, prev);
    return appendEdit(c, cfg, user, p, prev, content, "preparation.edited");
  });
}
export async function resolvePreparation(
  db: Db,
  cfg: Config,
  user: string,
  id: string,
  request: ResolutionRequest,
  expected: string | undefined,
) {
  validate(cfg, "ResolutionRequest.json", request);
  if (!request.rationale.trim())
    throw new Refusal(400, "invalid", "Give the reason for this resolution");
  return tx(db, async (c) => {
    const p = await lockedPackage(c, id);
    editable(p);
    const prev = await head(c, id);
    if (!prev)
      throw new Refusal(404, "not-enrolled", "Enroll preparation first");
    cas(prev, expected);
    const content = preparationContent(prev);
    const item = [...content.questions, ...content.escalations].find(
      (v) => v.id === request.item_id,
    );
    if (!item)
      throw new Refusal(
        404,
        "item-not-found",
        "No such question or escalation",
      );
    if (item.resolution_refs.length)
      throw new Refusal(
        409,
        "already-resolved",
        "This item already has a recorded resolution; raise a new question for a changed basis.",
      );
    if (
      request.source_refs.some(
        (ref) => !content.basis.some((b) => b.reference === ref),
      )
    )
      throw new Refusal(
        400,
        "unknown-source",
        "Resolution references an unknown source",
      );
    const resolution = {
      id: `RES-${randomUUID()}`,
      item_id: item.id,
      actor: actor(user),
      rationale: request.rationale,
      source_refs: request.source_refs,
    };
    content.resolutions.push(resolution);
    item.resolution_refs.push(resolution.id);
    if ("state" in item) item.state = "resolved";
    return appendEdit(c, cfg, user, p, prev, content, "preparation.resolved");
  });
}
export async function preparationHistory(
  db: Db,
  id: string,
  before?: number,
  limit = 20,
) {
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 50 ||
    (before !== undefined && (!Number.isInteger(before) || before < 0))
  )
    throw new Refusal(
      400,
      "invalid",
      "History limit is 1–50 and before is a nonnegative revision",
    );
  return tx(db, async (c) => {
    const p = await lockedPackage(c, id);
    if (!(await head(c, id)))
      throw new Refusal(404, "not-enrolled", "This package has no preparation");
    const rows = (
      await c.query<{ body: PreparationSnapshot }>(
        "select body from preparation_snapshots where package_id=$1 and ($2::int is null or revision<$2) order by revision desc limit $3",
        [id, before ?? null, limit + 1],
      )
    ).rows;
    const revisions = rows.slice(0, limit).map((r) => view(r.body, p));
    return {
      revisions,
      ...(rows.length > limit
        ? { next_before: revisions[revisions.length - 1]!.snapshot.revision }
        : {}),
    };
  });
}
