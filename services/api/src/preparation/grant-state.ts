import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Ajv2020 } from "ajv/dist/2020.js";
import type { Db, Tx } from "../db/index.js";
import { command } from "../commands/executor.js";
import type { CommandName } from "../commands/catalog.js";
import { digest } from "../kernel.js";
import { Refusal, type PackageRow } from "../work.js";
import { captureInput } from "./basis.js";
import type { PreparationGrant, PreparationSnapshot } from "./types.js";
export const SOURCE_LIMIT = 5 * 1024 * 1024,
  TOTAL_LIMIT = 25 * 1024 * 1024,
  INPUT_LIMIT = 16,
  OPERATION_LIMIT = 64,
  PENDING_LIMIT = 2;
export type GrantConfig = { ajv: Ajv2020 };
export interface GrantRow {
  id: string;
  run_id: string;
  package_id: string;
  package_revision: number;
  preparation_id: string;
  preparation_revision: number;
  token_hash: string;
  claim_token_hash: string;
  expires_at: Date;
  body: PreparationGrant;
  run_binding: Record<string, unknown>;
  package_body: Record<string, unknown>;
  preparation_body: PreparationSnapshot;
  capture_id: string | null;
  capture_input: Record<string, unknown> | null;
}
export interface RunRow {
  id: string;
  package_id: string;
  package_revision: number;
  role: string;
  round: number;
  status: string;
  body: Record<string, any>;
  claim_token_hash: string | null;
  lease_expires_at: Date | null;
}
export interface GrantBlob {
  id: string;
  path: string;
  reference: string;
  kind: string;
  key: string;
  fingerprint: string;
  bytes: Buffer;
}
export const rawHash = (data: Buffer | string) =>
  createHash("sha256").update(data).digest("hex");
export const runBinding = (body: Record<string, any>) => ({
  agent_baseline: body.agent_baseline,
  runtime: body.runtime,
  round: body.round,
});
export const newSecret = () => randomBytes(32).toString("base64url");
export function matchesSecret(stored: string | null, token: unknown): boolean {
  if (
    typeof token !== "string" ||
    !token ||
    token.length > 512 ||
    !stored ||
    !/^[a-f0-9]{64}$/.test(stored)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(stored, "hex"),
    Buffer.from(rawHash(token), "hex"),
  );
}
export const stale = () =>
  new Refusal(
    409,
    "grant-stale",
    "The assigned run, lease, preparation or input authority is no longer current",
  );
export const unauthorized = () =>
  new Refusal(
    401,
    "grant-token-required",
    "A valid credential for this preparation grant is required",
  );
export function validateGrantValue(
  cfg: GrantConfig,
  schema: string,
  value: unknown,
): void {
  if (!cfg.ajv.validate(schema, value))
    throw new Refusal(
      400,
      "invalid",
      "The preparation grant message does not match its closed contract",
    );
}
export async function grantTx<T>(
  db: Db,
  name: CommandName,
  fn: (c: Tx) => Promise<T>,
): Promise<T> {
  try {
    return await command(db, name, async (c) => {
      const support = (
        await c.query<{ setting: string | null }>(
          "select current_setting('transaction_timeout',true) as setting",
        )
      ).rows[0];
      if (!support || support.setting == null)
        throw new Refusal(
          409,
          "grant-database-version",
          "Controller grants require PostgreSQL 17 or newer for a server-enforced total transaction budget",
        );
      await c.query(
        "select set_config('lock_timeout','1000ms',true),set_config('statement_timeout','4000ms',true),set_config('idle_in_transaction_session_timeout','4000ms',true),set_config('transaction_timeout','5000ms',true)",
      );
      return fn(c);
    });
  } catch (error) {
    if (error instanceof Refusal) throw error;
    const code = (error as { code?: string }).code;
    if (
      ["55P03", "57014", "25P03", "25P04", "40P01", "40001"].includes(
        code ?? "",
      )
    )
      throw new Refusal(
        409,
        "grant-busy",
        "Authority did not return a usable acknowledgment within its database budget; resolve only by retrying the same operation while authority is current",
      );
    if (code === "23514") throw stale();
    throw error;
  }
}
export async function wall(c: Tx): Promise<Date> {
  return (await c.query<{ at: Date }>("select clock_timestamp() as at"))
    .rows[0]!.at;
}
export async function packageForGrant(c: Tx, id: string): Promise<PackageRow> {
  const p = (
    await c.query<PackageRow>(
      "select id,revision,status,capture_id,case when octet_length(body::text)<=$2 then body else null end as body from packages where id=$1 order by revision desc limit 1 for update",
      [id, SOURCE_LIMIT],
    )
  ).rows[0];
  if (
    !p ||
    !p.body ||
    p.status !== "draft" ||
    !["public", "internal"].includes(p.body.data_lane)
  )
    throw stale();
  if (
    p.body.id !== p.id ||
    p.body.revision !== p.revision ||
    p.body.status !== "draft"
  )
    throw stale();
  return p;
}
export async function headForGrant(
  c: Tx,
  id: string,
  cfg: GrantConfig,
): Promise<PreparationSnapshot> {
  const h = (
    await c.query<{
      preparation_id: string;
      revision: number;
      content_digest: string;
      size: number;
    }>(
      "select h.preparation_id,h.revision,s.content_digest,octet_length(s.body::text) as size from preparation_heads h join preparation_snapshots s on s.preparation_id=h.preparation_id and s.revision=h.revision where h.package_id=$1 for update of h",
      [id],
    )
  ).rows[0];
  if (!h || h.size > SOURCE_LIMIT) throw stale();
  const body = (
    await c.query<{ body: PreparationSnapshot }>(
      "select body from preparation_snapshots where preparation_id=$1 and revision=$2",
      [h.preparation_id, h.revision],
    )
  ).rows[0]?.body;
  if (
    !body ||
    body.id !== h.preparation_id ||
    body.revision !== h.revision ||
    body.package_id !== id ||
    !cfg.ajv.validate("PreparationSnapshot.json", body) ||
    digest(body) !== h.content_digest
  )
    throw stale();
  return body;
}
export async function runForGrant(
  c: Tx,
  cfg: GrantConfig,
  id: string,
  p: PackageRow,
): Promise<RunRow> {
  const r = (
    await c.query<RunRow>("select * from runs where id=$1 for update", [id])
  ).rows[0];
  if (
    !r ||
    r.role !== "requirements-preparer" ||
    r.status !== "running" ||
    r.package_id !== p.id ||
    r.package_revision !== p.revision ||
    r.body.stop_requested_at ||
    !r.lease_expires_at ||
    r.lease_expires_at <= (await wall(c))
  )
    throw stale();
  if (
    r.body.id !== r.id ||
    r.body.role !== r.role ||
    r.body.status !== r.status ||
    r.body.package_id !== r.package_id ||
    r.body.package_revision !== r.package_revision ||
    r.body.round !== r.round ||
    new Date(r.body.lease_expires_at).getTime() !==
      r.lease_expires_at.getTime() ||
    !cfg.ajv.validate("Run.json", r.body)
  )
    throw stale();
  return r;
}
/** Only DB-backed request context is granted; external source contents are not. */
export async function requestInputs(
  c: Tx,
  p: PackageRow,
  s: PreparationSnapshot,
): Promise<{ blobs: GrantBlob[]; capture: Record<string, unknown> | null }> {
  const blobs: GrantBlob[] = [];
  function add(
    id: string,
    reference: string,
    kind: string,
    key: string,
    data: Buffer,
    fingerprint: string,
  ) {
    if (
      data.length > SOURCE_LIMIT ||
      blobs.length >= INPUT_LIMIT ||
      blobs.reduce((n, b) => n + b.bytes.length, 0) + data.length > TOTAL_LIMIT
    )
      throw new Refusal(
        409,
        "grant-input-budget",
        "Assigned request inputs exceed the supported resource budget",
      );
    blobs.push({
      id,
      path: `${id}.${kind === "attachment" ? "bin" : "json"}`,
      reference,
      kind,
      key,
      bytes: data,
      fingerprint,
    });
  }
  add(
    "preparation",
    `preparation:${s.id}`,
    "snapshot",
    s.id,
    Buffer.from(JSON.stringify(s)),
    digest(s),
  );
  let capture: Record<string, unknown> | null = null;
  if (p.capture_id) {
    const row = (
      await c.query<{ body: Record<string, unknown> | null }>(
        "select case when octet_length(body::text)<=$2 then body else null end as body from captures where id=$1 for share",
        [p.capture_id, SOURCE_LIMIT],
      )
    ).rows[0];
    if (!row?.body) throw stale();
    capture = captureInput(row.body);
    if (
      row.body.id !== p.capture_id ||
      !s.basis.some(
        (b) =>
          b.kind === "capture" &&
          b.reference === `capture:${p.capture_id}` &&
          b.revision === "0" &&
          b.digest.algorithm === "sha256" &&
          b.digest.value === digest(capture),
      )
    )
      throw stale();
    add(
      "capture",
      `capture:${p.capture_id}`,
      "capture",
      p.capture_id,
      Buffer.from(JSON.stringify(capture)),
      digest(capture),
    );
    const attachments = (
      await c.query<{ name: string; sha256: string; size: number }>(
        "select name,sha256,octet_length(bytes) as size from attachments where capture_id=$1 order by name limit $2 for share",
        [p.capture_id, INPUT_LIMIT + 1],
      )
    ).rows;
    if (attachments.length + blobs.length > INPUT_LIMIT)
      throw new Refusal(
        409,
        "grant-input-budget",
        "Too many original attachments for this grant",
      );
    const originalPrefix = `attachment:${p.capture_id}/`;
    const pinnedAttachments = new Set(
      s.basis
        .filter(
          (b) =>
            b.kind === "attachment" && b.reference.startsWith(originalPrefix),
        )
        .map((b) => b.reference),
    );
    if (
      pinnedAttachments.size !== attachments.length ||
      attachments.some(
        (a) => !pinnedAttachments.has(`${originalPrefix}${a.name}`),
      )
    )
      throw stale();
    for (const [i, a] of attachments.entries()) {
      if (a.size > SOURCE_LIMIT)
        throw new Refusal(
          409,
          "grant-input-budget",
          "An attachment exceeds the source budget",
        );
      const bytes = (
        await c.query<{ bytes: Buffer }>(
          "select bytes from attachments where capture_id=$1 and name=$2",
          [p.capture_id, a.name],
        )
      ).rows[0]?.bytes;
      if (!bytes || rawHash(bytes) !== a.sha256) throw stale();
      if (
        !s.basis.some(
          (b) =>
            b.kind === "attachment" &&
            b.reference === `attachment:${p.capture_id}/${a.name}` &&
            b.revision === "0" &&
            b.digest.algorithm === "sha256" &&
            b.digest.value === a.sha256,
        )
      )
        throw stale();
      add(
        `attachment-${i}`,
        `attachment:${p.capture_id}/${a.name}`,
        "attachment",
        a.name,
        bytes,
        a.sha256,
      );
    }
  }
  return { blobs, capture };
}
/** Authenticate before JSON parsing; current fences are checked again under lock. */
export async function checkGrantCredential(
  db: Db,
  id: string,
  token: unknown,
): Promise<void> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw unauthorized();
  const m = (
    await db.query<{
      token_hash: string;
      live: boolean;
      revoked_at: Date | null;
      operations: number;
    }>(
      "select g.token_hash,(g.expires_at>clock_timestamp() and r.status='running' and r.lease_expires_at>clock_timestamp() and r.body->>'stop_requested_at' is null and r.claim_token_hash=g.claim_token_hash) as live,s.revoked_at,s.operations from preparation_grants g join preparation_grant_state s on s.grant_id=g.id join runs r on r.id=g.run_id where g.id=$1",
      [id],
    )
  ).rows[0];
  if (!m || !matchesSecret(m.token_hash, token)) throw unauthorized();
  if (!m.live || m.revoked_at) throw stale();
  if (m.operations >= OPERATION_LIMIT)
    throw new Refusal(
      409,
      "grant-budget",
      "This grant's finite operation budget is exhausted",
    );
}

export async function currentGrant(
  c: Tx,
  cfg: GrantConfig,
  id: string,
  token: unknown,
): Promise<GrantRow & { use_deadline: Date }> {
  const meta = (
    await c.query<{ token_hash: string; package_id: string }>(
      "select token_hash,package_id from preparation_grants where id=$1",
      [id],
    )
  ).rows[0];
  if (!meta || !matchesSecret(meta.token_hash, token)) throw unauthorized();
  const p = await packageForGrant(c, meta.package_id),
    s = await headForGrant(c, p.id, cfg);
  const g = (
    await c.query<GrantRow>("select * from preparation_grants where id=$1", [
      id,
    ])
  ).rows[0]!;
  const r = await runForGrant(c, cfg, g.run_id, p);
  const sources = await requestInputs(c, p, s);
  await c.query("select id from preparation_grants where id=$1 for update", [
    id,
  ]);
  const state = (
    await c.query<{ revoked_at: Date | null }>(
      "select revoked_at from preparation_grant_state where grant_id=$1 for update",
      [id],
    )
  ).rows[0];
  if (
    !state ||
    state.revoked_at ||
    g.expires_at <= (await wall(c)) ||
    r.claim_token_hash !== g.claim_token_hash ||
    digest(runBinding(r.body)) !== g.body.assignment_digest.value ||
    p.revision !== g.package_revision ||
    p.capture_id !== g.capture_id ||
    digest(p.body) !== g.body.package_digest.value ||
    s.id !== g.preparation_id ||
    s.revision !== g.preparation_revision ||
    digest(s) !== g.body.base_digest.value
  )
    throw stale();
  const pins = (
    await c.query<{
      input_id: string;
      kind: string;
      source_key: string;
      fingerprint: string;
      body: PreparationGrant["inputs"][number];
      bytes: Buffer;
    }>(
      "select * from preparation_grant_inputs where grant_id=$1 order by input_id",
      [id],
    )
  ).rows;
  if (
    !cfg.ajv.validate("PreparationGrant.json", g.body) ||
    pins.length !== g.body.inputs.length ||
    pins.length !== sources.blobs.length ||
    pins.some((pin) => {
      const actual = sources.blobs.find((x) => x.id === pin.input_id);
      return (
        !actual ||
        digest(pin.body) !==
          digest(g.body.inputs.find((x) => x.id === pin.input_id) ?? null) ||
        actual.kind !== pin.kind ||
        actual.key !== pin.source_key ||
        actual.fingerprint !== pin.fingerprint ||
        pin.body.digest.value !== rawHash(pin.bytes) ||
        pin.body.bytes !== pin.bytes.length
      );
    })
  )
    throw stale();
  // A trusted writer may shorten the run lease below the grant expiry; new uses never outlive either.
  const use_deadline =
    r.lease_expires_at! < g.expires_at ? r.lease_expires_at! : g.expires_at;
  return { ...g, use_deadline };
}
/** Every successful response, including receipt replay, arms a commit check. */
export async function armGrant(
  c: Tx,
  g: GrantRow,
  useId: string | null,
  deadline: Date,
): Promise<void> {
  const counted = await c.query(
    "update preparation_grant_state set operations=operations+1 where grant_id=$1 and operations<$2 and revoked_at is null returning operations",
    [g.id, g.body.max_operations],
  );
  if (!counted.rowCount)
    throw new Refusal(
      409,
      "grant-budget",
      "This grant's finite operation budget is exhausted",
    );
  await c.query(
    "insert into preparation_grant_guards(grant_id,use_id,deadline) values($1,$2,$3)",
    [g.id, useId, deadline],
  );
}
