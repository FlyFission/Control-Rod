import { createHash, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { type Db, tx } from "../src/db/index.js";
import { PREPARATION_PROTOCOL } from "../src/db/migrations/006-compatibility.js";
import {
  checkIdentity,
  countedProvider,
  deliverableDigest,
  harnessName,
  resolvedModel,
  signedPayload,
  verificationDigest,
} from "../src/run-attestation.js";
import { digest } from "../src/kernel.js";

/** One key for the suite. Production never loads it; tests insert the public half. */
const pair = generateKeyPairSync("ed25519");
const publicRaw = (pair.publicKey.export({ format: "der", type: "spki" }) as Buffer).subarray(-32);
const publicKey = publicRaw.toString("base64");
const keyId = createHash("sha256").update(publicRaw).digest("hex");

function artifactFor(harness: string): string {
  return createHash("sha256").update(`control-rod-test-harness:${harness}`).digest("hex");
}

/**
 * Signs a real attestation for a counted pre-check and records the public key
 * and executable digest the server will look up. A fake run is returned unchanged.
 * This is test construction. The server has no switch that skips verification.
 */
export async function sealCountedCheck(admin: Db, runId: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (body.verification == null && body.criterion_results === undefined) return body;
  const row = (await admin.query<{ body: Record<string, any>; package_revision: number; role: string }>(
    "select body, package_revision, role from runs where id = $1", [runId])).rows[0];
  if (!row || row.role !== "pre-check" || !countedProvider(row.body?.runtime?.provider)) return body;
  const harness = harnessName(String(row.body.runtime.provider));
  const model = harness === "claude" ? "claude-sonnet-4-5" : "gpt-5-codex";
  const resolved = resolvedModel(String(row.body.runtime?.model ?? ""), undefined);
  if (resolved !== model) {
    await tx(admin, async (c) => {
      await c.query("select set_config('controlrod.preparation_protocol', $1, true)", [PREPARATION_PROTOCOL]);
      await c.query("update runs set body = jsonb_set(body, '{runtime,model}', to_jsonb($2::text)) where id = $1", [runId, model]);
    });
  }
  const org = (await admin.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
  await admin.query(
    `insert into daemon_signing_keys (org_id, key_id, public_key, status, enrolled_by)
     values ($1, $2, $3, 'active', 'test-harness')
     on conflict (org_id, key_id) do nothing`,
    [org, keyId, publicKey],
  );
  const artifact = artifactFor(harness);
  const probeId = `rpb_${harness}_test`;
  const probe = {
    id: probeId, org_id: org, runtime: harness,
    artifact_digest: { algorithm: "sha256", value: artifact },
    version: "test", auth_state: "unknown", outcome: "pass",
    detail: "test harness", observed_at: "2026-01-01T00:00:00.000Z",
  };
  await admin.query(
    "insert into runtime_probes (body) select $1::jsonb where not exists (select 1 from runtime_probes where id = $2)",
    [JSON.stringify(probe), probeId],
  );
  const version = {
    id: `rav_${harness}_test`, org_id: org, runtime: harness, version: "test",
    artifact_digest: { algorithm: "sha256", value: artifact },
    install_path: "test", probe_ids: [probeId],
  };
  await admin.query(
    `insert into runtime_artifact_versions (body, digest)
     select $1::jsonb, $2
     where not exists (select 1 from runtime_artifact_versions where id = $3)`,
    [JSON.stringify(version), digest(version), version.id],
  );
  const policy = row.body?.sandbox_policy?.digest?.value as string | undefined;
  if (!policy) throw new Error(`counted check ${runId} has no sandbox policy digest`);
  const author = (await admin.query<{ id: string }>(
    `select id from runs where package_id = $1 and package_revision = $2 and role = 'author' and status = 'succeeded'
     order by created_at desc limit 1`,
    [row.body.package_id, row.package_revision])).rows[0];
  const files = author
    ? (await admin.query<{ name: string; sha256: string }>("select name, sha256 from outputs where run_id = $1 order by name", [author.id])).rows
    : [];
  const pinned = (await admin.query<{ deliverable_digest: string }>(
    "select deliverable_digest from checker_queued_digests where run_id = $1", [runId])).rows[0]?.deliverable_digest;
  const held = pinned ?? deliverableDigest(files);
  const outputs = Array.isArray(body.outputs) ? body.outputs as { name: string; content_base64: string }[] : [];
  const outputBytes = outputs.map((o) => ({ name: o.name, bytes: Buffer.from(o.content_base64, "base64") }));
  const checkId = checkIdentity(runId, row.package_revision, row.body.checker_attempt_id);
  const submission = { verification: body.verification as { outcome?: unknown; findings?: unknown } | null, criterion_results: body.criterion_results };
  const statement = {
    schema_version: "0.1.0",
    run_id: runId,
    nonce: randomBytes(32).toString("hex"),
    artifact_digest: { algorithm: "sha256", value: artifact },
    policy_digest: { algorithm: "sha256", value: policy },
    effective_config_digest: { algorithm: "sha256", value: createHash("sha256").update("test-config").digest("hex") },
    effective_endpoint: harness === "claude" ? "api.anthropic.com" : "api.openai.com",
    endpoint_enforcement: "endpoint not enforced",
    observed_models: [model],
    platform: "linux",
    probe_result: "not-run",
    workspace_before: { algorithm: "sha256", value: held },
    workspace_after: { algorithm: "sha256", value: held },
    requested_model: model,
    check_id: checkId,
    deliverable_digest: { algorithm: "sha256", value: held },
    verification_digest: { algorithm: "sha256", value: verificationDigest(checkId, submission, outputBytes) },
  };
  // workspace hashes must match each other. They are not the deliverable content digest.
  // Use the deliverable digest for both so a test tree that did not change still binds the bytes.
  const hash = Buffer.from(digest(signedPayload(statement)), "hex");
  const signature = sign(null, hash, pair.privateKey).toString("base64");
  return { ...body, attestation: { ...statement, key_id: keyId, signature } };
}

/** The fields tests read off a daemon response. Named so an async wrapper does not lose them. */
export interface DaemonReply {
  statusCode: number;
  body: string;
  json: <T = any>() => T;
}

/** Signs a completion the daemon posts. Other daemon calls are unchanged. */
export async function sealDaemonPayload(admin: Db, url: string, payload: unknown): Promise<Record<string, unknown>> {
  const match = /^\/runner\/runs\/([^/]+)\/complete$/.exec(url);
  const runId = match?.[1];
  if (!runId || payload == null || typeof payload !== "object") return (payload ?? {}) as Record<string, unknown>;
  return sealCountedCheck(admin, runId, payload as Record<string, unknown>);
}
