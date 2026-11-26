import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deliverableDigest as recordedDeliverableDigest } from "./checker-attempts.js";
import type { Tx } from "./db/index.js";
import { digest } from "./kernel.js";
import { Refusal } from "./refusal.js";

/**
 * Run attestation (ADR 0022). The signed bytes are the SHA-256 of the RFC 8785
 * form of the payload, the same profile as `digest`. The signature and key id
 * are not in that payload. The harness is chosen from the executable's SHA-256.
 */

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface ModelEntry {
  id: string;
  harness: string;
  names: string[];
  hosts: string[];
  deciding: boolean;
  local: boolean;
}

interface Registry {
  models: ModelEntry[];
}

let registryCache: Registry | undefined;

export function loadModelRegistry(): Registry {
  if (!registryCache) {
    const path = fileURLToPath(new URL("../../../daemon/internal/runner/models.json", import.meta.url));
    registryCache = JSON.parse(readFileSync(path, "utf8")) as Registry;
  }
  return registryCache;
}

/** Test hook. Production uses the file next to the daemon. */
export function setModelRegistryForTest(reg: Registry | undefined) {
  registryCache = reg;
}

export function harnessName(provider: string): string {
  const p = provider.toLowerCase();
  if (p === "anthropic" || p === "claude" || p === "claude-code") return "claude";
  if (p === "openai" || p === "codex") return "codex";
  if (p === "xai" || p === "grok" || p === "grok-cli") return "grok";
  if (p === "opencode") return "opencode";
  if (p === "agy" || p === "antigravity" || p === "gemini-cli") return "agy";
  if (p === "ollama" || p === "local-ollama") return "ollama";
  return p;
}

export function countedProvider(provider: unknown): boolean {
  const n = harnessName(String(provider ?? ""));
  // OpenCode and Ollama are named above but not counted: they have no registered models and the
  // daemon does not start them yet, so a pre-check on one cannot count. Antigravity and Grok CLI
  // count with the models models.json registers for them (change records agy-seat, grok-seat).
  return n === "claude" || n === "codex" || n === "agy" || n === "grok";
}

/** A probe can order eligible checker models. The registry remains the admission authority. */
/** The registered checker models a provider may run for a grade: hosted, and for Safety or Material, deciding and not local. */
function admittedCheckerModels(provider: string, grade: string | undefined) {
  const high = grade === "safety" || grade === "material";
  return loadModelRegistry().models.filter(
    (model) => model.harness === harnessName(provider) && model.hosts.length > 0 && (!high || (model.deciding && !model.local)),
  );
}

/** Whether an explicitly chosen checker model passes the same registry and grade filter as the default. */
export function checkerModelAdmitted(provider: string, grade: string | undefined, model: string): boolean {
  return admittedCheckerModels(provider, grade).some((m) => m.id === model);
}

export function defaultCheckerModel(provider: string, grade: string | undefined, reported: readonly string[] = []): string | undefined {
  const admitted = admittedCheckerModels(provider, grade);
  return reported.find((id) => admitted.some((model) => model.id === id)) ?? admitted[0]?.id;
}

export interface AttestationVerdict {
  verified: boolean;
  code: string;
  reason: string;
  /** True when the signature matched an enrolled key. The nonce is then consumed. */
  signatureOk: boolean;
}

export interface AttestationFacts {
  runId: string;
  provider: string;
  model: string;
  pinModel?: string | undefined;
  checkId: string;
  grade?: string | undefined;
  policyDigest?: string | undefined;
  deliverableDigest?: string | undefined;
  verificationDigest?: string | undefined;
  attestation: unknown;
  /** Raw 32-byte public key, or null when the key id is not an active key. */
  publicKey: Buffer | null;
  /** Set when a row exists and is not active. */
  keyRetired?: boolean | undefined;
  /** Runtime stored for the artifact digest, or null when the lookup misses. */
  harness: string | null;
  registry?: Registry | undefined;
}

type Json = Record<string, any>;

function fail(code: string, reason: string, signatureOk = false): AttestationVerdict {
  return { verified: false, code, reason, signatureOk };
}

function sha256Digest(value: unknown): value is { algorithm: string; value: string } {
  return Boolean(value && typeof value === "object" && (value as Json).algorithm === "sha256" && /^[0-9a-f]{64}$/.test(String((value as Json).value ?? "")));
}

export function signedPayload(a: Json) {
  const models = Array.isArray(a.observed_models) ? [...a.observed_models].map(String).filter((s) => s !== "").sort() : [];
  return {
    schema_version: a.schema_version,
    run_id: a.run_id,
    nonce: a.nonce,
    artifact_digest: a.artifact_digest,
    policy_digest: a.policy_digest,
    effective_config_digest: a.effective_config_digest,
    effective_endpoint: a.effective_endpoint,
    endpoint_enforcement: a.endpoint_enforcement,
    observed_models: models,
    platform: a.platform,
    probe_result: a.probe_result,
    workspace_before: a.workspace_before,
    workspace_after: a.workspace_after,
    requested_model: a.requested_model,
    check_id: a.check_id,
    deliverable_digest: a.deliverable_digest,
    verification_digest: a.verification_digest,
  };
}

/** Names and byte digests, sorted by name. The same list the daemon signs and attempt records store. */
export function deliverableDigest(files: { name: string; sha256: string }[]): string {
  const rows = [...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return recordedDeliverableDigest(rows);
}

/**
 * Canonical digest of the verification submission. criterion_results is null when
 * the completion did not send any. Evidence is every output that is not the
 * verdict file itself.
 */
export function verificationDigest(checkId: string, submission: { verification?: { outcome?: unknown; findings?: unknown } | null; criterion_results?: unknown }, outputs: { name: string; bytes: Buffer }[]): string {
  const evidence = outputs
    .filter((o) => o.name !== "verification.json" && o.name !== "criterion-results.json")
    .map((o) => ({ name: o.name, sha256: createHash("sha256").update(o.bytes).digest("hex") }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const findings = Array.isArray(submission.verification?.findings) ? submission.verification.findings : [];
  return digest({
    check_id: checkId,
    criterion_results: submission.criterion_results === undefined ? null : submission.criterion_results,
    evidence,
    findings,
    outcome: typeof submission.verification?.outcome === "string" ? submission.verification.outcome : "",
  });
}

/** runtime.model when it names a model, otherwise the pin's model. Never a vendor default. */
export function resolvedModel(model: string | undefined, pinModel: string | undefined): string {
  const own = String(model ?? "").trim();
  if (own && own !== "default" && own !== "any") return own;
  const pin = String(pinModel ?? "").trim();
  if (pin && pin !== "default" && pin !== "any") return pin;
  return "";
}

export function checkIdentity(runId: string, packageRevision: number, attemptId?: string): string {
  const attempt = String(attemptId ?? "").trim();
  if (attempt) return attempt;
  return `${runId}:${packageRevision}`;
}

function ed25519Key(raw: Buffer) {
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
}

/**
 * Decides whether a counted pre-check's attestation holds. It does not write.
 * A missing attestation, a bad signature, an unknown key, a replay, an
 * unregistered model, a failed harness lookup, a custom endpoint, or a failed
 * probe does not verify. No vendor is assumed when the registry misses.
 */
export function judgeAttestation(f: AttestationFacts): AttestationVerdict {
  if (f.attestation == null) {
    return fail("missing", "The check has no attestation, so it cannot count");
  }
  if (typeof f.attestation !== "object") {
    return fail("malformed", "The attestation is not an object, so the check cannot count");
  }
  const a = f.attestation as Json;
  if (a.schema_version !== "0.1.0" || typeof a.run_id !== "string" || !/^[0-9a-f]{64}$/.test(String(a.nonce ?? ""))
    || !sha256Digest(a.artifact_digest) || !sha256Digest(a.policy_digest) || !sha256Digest(a.effective_config_digest)
    || typeof a.effective_endpoint !== "string" || typeof a.endpoint_enforcement !== "string"
    || !Array.isArray(a.observed_models) || typeof a.platform !== "string" || !/^[a-z0-9]+$/.test(a.platform)
    || typeof a.probe_result !== "string" || !sha256Digest(a.workspace_before) || !sha256Digest(a.workspace_after)
    || typeof a.requested_model !== "string" || typeof a.check_id !== "string"
    || !sha256Digest(a.deliverable_digest) || !sha256Digest(a.verification_digest)
    || !/^[0-9a-f]{64}$/.test(String(a.key_id ?? "")) || typeof a.signature !== "string") {
    return fail("malformed", "The attestation is missing a field, so the check cannot count");
  }
  if (f.keyRetired) {
    return fail("retired", "The attestation signing key has been retired, so the check cannot count");
  }
  if (f.publicKey == null || f.publicKey.length !== 32) {
    return fail("unknown-key", "The attestation is signed by a key this organization has not enrolled, so the check cannot count");
  }
  const keyId = createHash("sha256").update(f.publicKey).digest("hex");
  if (keyId !== a.key_id) {
    return fail("unknown-key", "The attestation key id does not match the enrolled key, so the check cannot count");
  }
  let signatureOk = false;
  try {
    const hash = Buffer.from(digest(signedPayload(a)), "hex");
    const sig = Buffer.from(String(a.signature), "base64");
    signatureOk = verify(null, hash, ed25519Key(f.publicKey), sig);
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return fail("bad-signature", "The attestation signature does not verify, so the check cannot count");
  }
  if (a.run_id !== f.runId) {
    return fail("tampered", "The attestation names another run, so the check cannot count", true);
  }
  if (a.check_id !== f.checkId) {
    return fail("tampered", "The attestation names another check, so the check cannot count", true);
  }
  const wantModel = resolvedModel(f.model, f.pinModel);
  if (!wantModel || a.requested_model !== wantModel) {
    return fail("unregistered-model", "The attested model is not the model this run asked for, so the check cannot count", true);
  }
  if (!f.deliverableDigest || a.deliverable_digest.value !== f.deliverableDigest) {
    return fail("tampered", "The attested deliverable digest is not the package revision's deliverable, so the check cannot count", true);
  }
  if (!f.verificationDigest || a.verification_digest.value !== f.verificationDigest) {
    return fail("tampered", "The attested verification digest does not match the submission, so the check cannot count", true);
  }
  if (!f.policyDigest || a.policy_digest.value !== f.policyDigest) {
    return fail("tampered", "The attestation's policy digest does not match the run, so the check cannot count", true);
  }
  if (a.workspace_before.value !== a.workspace_after.value) {
    return fail("tampered", "The workspace hashes differ, so the check cannot count", true);
  }
  if (a.probe_result === "fail") {
    return fail("probe-failed", "The in-run probe failed, so the check cannot count", true);
  }
  if (a.probe_result !== "pass" && a.probe_result !== "not-run") {
    return fail("malformed", "The probe result is not one this server accepts, so the check cannot count", true);
  }
  if (a.endpoint_enforcement !== "endpoint not enforced") {
    return fail("endpoint", "The attestation says the endpoint was enforced, and no egress proxy is in place, so the check cannot count", true);
  }
  const harness = harnessName(f.provider);
  if (f.harness == null) {
    return fail("harness-unknown", "The executable digest is not a registered harness, so the check cannot count", true);
  }
  if (f.harness !== harness) {
    return fail("harness-mismatch", `The executable digest is registered as ${f.harness}, so the check cannot count`, true);
  }
  const reg = f.registry ?? loadModelRegistry();
  const model = wantModel;
  const entry = reg.models.find((m) => m.id === model);
  if (!entry) {
    return fail("unregistered-model", `Model ${model} is not registered, so the check cannot count`, true);
  }
  if (entry.harness !== harness) {
    return fail("unregistered-model", `Model ${model} is registered for ${entry.harness}, so the check cannot count`, true);
  }
  const high = f.grade === "safety" || f.grade === "material";
  if (entry.local && high) {
    return fail("not-deciding", "A local model cannot be the deciding checker on Safety or Material", true);
  }
  if (!entry.deciding && high) {
    return fail("not-deciding", "This model is not a deciding checker on Safety or Material", true);
  }
  if (entry.hosts.length === 0 || !entry.hosts.includes(String(a.effective_endpoint))) {
    return fail("custom-endpoint", "The effective endpoint is not the pinned model's vendor host, so the check cannot count", true);
  }
  const allowed = new Set(entry.names);
  const observed = (a.observed_models as unknown[]).map(String);
  if (observed.length === 0 || !observed.includes(entry.id)) {
    return fail("provenance-unknown", "The stream did not name the pinned model, so provenance is unknown and the check cannot count", true);
  }
  for (const name of observed) {
    if (!allowed.has(name) && !datedSnapshot(entry.id, name)) {
      return fail("provenance-unknown", `The stream named ${name}, which is outside the pinned model, so provenance is unknown and the check cannot count`, true);
    }
  }
  return { verified: true, code: "ok", reason: "The daemon attestation verified", signatureOk: true };
}

/**
 * The pinned id with a release date appended (<id>-YYYYMMDD): the dated snapshot the vendor's
 * stream names for the pinned name (claude-haiku-4-5 streams claude-haiku-4-5-20251001). A
 * shorter alias or another model never matches. Same rule as the daemon's DatedSnapshot.
 */
export function datedSnapshot(id: string, name: string): boolean {
  return name.startsWith(`${id}-`) && /^\d{8}$/.test(name.slice(id.length + 1));
}

async function soleOrg(c: Tx): Promise<string> {
  return (await c.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
}

export type NonceClaim = "stored" | "same" | "replay";

/**
 * Inserts the nonce only after the payload has already validated. A conflict is
 * a replay unless this run already stored this exact payload.
 */
export async function rememberNonce(c: Tx, row: { orgId: string; keyId: string; nonce: string; runId: string; payloadHash: string }): Promise<NonceClaim> {
  const inserted = await c.query(
    `insert into attestation_nonces (org_id, key_id, nonce, run_id, payload_hash)
     values ($1, $2, $3, $4, $5)
     on conflict (org_id, key_id, nonce) do nothing
     returning run_id`,
    [row.orgId, row.keyId, row.nonce, row.runId, row.payloadHash],
  );
  if (inserted.rowCount) return "stored";
  const existing = (await c.query<{ run_id: string; payload_hash: string }>(
    "select run_id, payload_hash from attestation_nonces where org_id = $1 and key_id = $2 and nonce = $3",
    [row.orgId, row.keyId, row.nonce])).rows[0];
  if (existing && existing.run_id === row.runId && existing.payload_hash === row.payloadHash) return "same";
  return "replay";
}

/** Loads the enrolled key and the harness for the digest, judges, then consumes the nonce. */
export async function verifyCountedAttestation(c: Tx, input: {
  runId: string;
  packageRevision: number;
  provider: string;
  model: string;
  pinModel?: string | undefined;
  attemptId?: string | undefined;
  grade?: string | undefined;
  policyDigest?: string | undefined;
  deliverableDigest: string | undefined;
  attestation: unknown;
  submission: { verification?: { outcome?: unknown; findings?: unknown } | null; criterion_results?: unknown };
  outputs: { name: string; bytes: Buffer }[];
}): Promise<AttestationVerdict & { deliverable_digest?: { algorithm: "sha256"; value: string } }> {
  if (input.attestation == null) {
    return fail("missing", "The check has no attestation, so it cannot count");
  }
  const a = input.attestation as Json;
  const keyId = typeof a?.key_id === "string" ? a.key_id : "";
  const org = await soleOrg(c);
  const keyRow = keyId
    ? (await c.query<{ public_key: string; status: string }>(
      "select public_key, status from daemon_signing_keys where org_id = $1 and key_id = $2",
      [org, keyId])).rows[0]
    : undefined;
  const publicKey = keyRow?.status === "active" ? Buffer.from(keyRow.public_key, "base64") : null;
  const digestValue = sha256Digest(a?.artifact_digest) ? a.artifact_digest.value : "";
  const harnessRow = digestValue
    ? (await c.query<{ runtime: string }>(
      "select runtime from runtime_artifact_versions where artifact_digest = $1 and org_id = $2 limit 1",
      [digestValue, org])).rows[0]
    : undefined;
  const checkId = checkIdentity(input.runId, input.packageRevision, input.attemptId);
  const heldDeliverable = input.deliverableDigest ?? "";
  const heldVerification = verificationDigest(checkId, input.submission, input.outputs);
  const verdict = judgeAttestation({
    runId: input.runId,
    provider: input.provider,
    model: input.model,
    pinModel: input.pinModel,
    checkId,
    grade: input.grade,
    policyDigest: input.policyDigest,
    deliverableDigest: heldDeliverable,
    verificationDigest: heldVerification,
    attestation: input.attestation,
    publicKey,
    keyRetired: keyRow != null && keyRow.status !== "active",
    harness: harnessRow?.runtime ?? (await unpinnedHarness(c, org, input.provider, digestValue)),
  });
  const deliverable = { algorithm: "sha256" as const, value: heldDeliverable };
  if (!verdict.verified) return { ...verdict, deliverable_digest: deliverable };
  const nonce = String(a.nonce);
  const payloadHash = digest(signedPayload(a));
  const claim = await rememberNonce(c, { orgId: org, keyId, nonce, runId: input.runId, payloadHash });
  if (claim === "replay") {
    return { ...fail("replay", "This attestation nonce was already used, so the check cannot count", true), deliverable_digest: deliverable };
  }
  return { ...verdict, deliverable_digest: deliverable };
}

/**
 * The harness of a check whose executable digest no pin registers. While the organization has no
 * live pin for that runtime, a passing probe of that exact digest is its registration, the rule the
 * daemon itself uses (artifact.go, #220): the daemon launches only the file its probe qualified, and
 * the enrolled daemon key signs the digest it ran. So a fresh install's checks count. Once an
 * administrator pins the runtime, only a pinned digest counts.
 */
export async function unpinnedHarness(c: Tx, org: string, provider: string, digestValue: string): Promise<string | null> {
  if (!countedProvider(provider) || !digestValue) return null;
  const harness = harnessName(provider);
  const pinned = await c.query(
    "select 1 from runtime_pins where org_id = $1 and runtime = $2 and body->>'status' in ('active', 'suspended') limit 1",
    [org, harness]);
  if (pinned.rowCount) return null;
  const probed = await c.query(
    "select 1 from runtime_probes where body->>'org_id' = $1 and body->>'runtime' = $2 and body->'artifact_digest'->>'value' = $3 and body->>'outcome' = 'pass' limit 1",
    [org, harness, digestValue]);
  return probed.rowCount ? harness : null;
}

/** Records a daemon public key. The caller has already passed the passkey gate. */
export async function enrollDaemonKey(c: Tx, orgId: string, memberId: string, p: Record<string, unknown>) {
  let raw: Buffer;
  try {
    raw = Buffer.from(String(p.public_key ?? ""), "base64");
  } catch {
    throw new Refusal(400, "invalid", "public_key must be the base64 of a 32-byte Ed25519 key");
  }
  if (raw.length !== 32) throw new Refusal(400, "invalid", "public_key must be the base64 of a 32-byte Ed25519 key");
  const keyId = createHash("sha256").update(raw).digest("hex");
  const existing = (await c.query<{ status: string }>(
    "select status from daemon_signing_keys where org_id = $1 and key_id = $2", [orgId, keyId])).rows[0];
  if (existing?.status === "retired") throw new Refusal(409, "invalid", "That signing key was retired");
  if (!existing) {
    await c.query(
      "insert into daemon_signing_keys (org_id, key_id, public_key, status, enrolled_by) values ($1, $2, $3, 'active', $4)",
      [orgId, keyId, raw.toString("base64"), memberId],
    );
  }
  return { key_id: keyId, status: "active" };
}

/**
 * Enrolls the local daemon's signing key on first use, with the daemon's own token: while every key
 * the organization has had was enrolled this way (none by an administrator). A new key retires the
 * daemon's earlier ones. Once an administrator has enrolled a key, a different key still needs a
 * signed daemon.enroll-key. Returns enrolled, already (this key is active), or needs-admin. With no
 * organization yet (setup not finished), returns no-organization and the daemon tries again later.
 */
export async function enrollFirstDaemonKey(c: Tx, p: Record<string, unknown>) {
  const raw = Buffer.from(String(p.public_key ?? ""), "base64");
  if (raw.length !== 32) throw new Refusal(400, "invalid", "public_key must be the base64 of a 32-byte Ed25519 key");
  const keyId = createHash("sha256").update(raw).digest("hex");
  const orgs = (await c.query<{ id: string }>("select id from organizations order by id limit 2")).rows;
  if (orgs.length === 0) return { key_id: keyId, status: "no-organization" };
  if (orgs.length > 1) return { key_id: keyId, status: "needs-admin" };
  const orgId = orgs[0]!.id;
  // One first-use enrollment at a time, so two daemons cannot both enroll a "first" key.
  await c.query("select pg_advisory_xact_lock(hashtext('controlrod.daemon_first_key'))");
  const rows = (await c.query<{ key_id: string; status: string; enrolled_by: string }>(
    "select key_id, status, enrolled_by from daemon_signing_keys where org_id = $1", [orgId])).rows;
  const mine = rows.find((r) => r.key_id === keyId);
  if (mine) return { key_id: keyId, status: mine.status === "active" ? "already" : "needs-admin" };
  // A key an administrator enrolled is never replaced this way. Keys the daemon enrolled itself
  // are: the daemon's token holder enrolled them, so a new key from it (its store moved from the
  // keychain to a file, or the file was lost) adds nothing that holder could not already do. The
  // old ones are retired, so one daemon key counts at a time.
  if (rows.some((r) => r.enrolled_by !== "daemon-first-use")) return { key_id: keyId, status: "needs-admin" };
  if (rows.length > 0) {
    await c.query("update daemon_signing_keys set status = 'retired', retired_at = now() where org_id = $1 and status = 'active' and enrolled_by = 'daemon-first-use'", [orgId]);
  }
  await c.query(
    "insert into daemon_signing_keys (org_id, key_id, public_key, status, enrolled_by) values ($1, $2, $3, 'active', 'daemon-first-use')",
    [orgId, keyId, raw.toString("base64")],
  );
  return { key_id: keyId, status: "enrolled" };
}

/** Retires one enrolled key. Signatures from it stop counting at once. The row stays for the audit. */
export async function retireDaemonKey(c: Tx, orgId: string, p: Record<string, unknown>) {
  const keyId = String(p.key_id ?? "");
  if (!/^[0-9a-f]{64}$/.test(keyId)) throw new Refusal(400, "invalid", "key_id must be the hex SHA-256 of the public key");
  const updated = await c.query(
    "update daemon_signing_keys set status = 'retired', retired_at = now() where org_id = $1 and key_id = $2 and status = 'active'",
    [orgId, keyId],
  );
  if (!updated.rowCount) throw new Refusal(404, "not-found", "No active daemon signing key has that id");
  return { key_id: keyId, status: "retired" };
}
