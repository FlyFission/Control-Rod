import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
  return p;
}

export function countedProvider(provider: unknown): boolean {
  const n = harnessName(String(provider ?? ""));
  return n === "claude" || n === "codex";
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
  grade?: string | undefined;
  policyDigest?: string | undefined;
  attestation: unknown;
  /** Raw 32-byte public key, or null when the key id is not enrolled. */
  publicKey: Buffer | null;
  /** Runtime stored for the artifact digest, or null when the lookup misses. */
  harness: string | null;
  /** Run that already used this nonce, or null when the nonce is fresh. */
  nonceOwner: string | null;
  registry?: Registry | undefined;
}

type Json = Record<string, any>;

function fail(code: string, reason: string, signatureOk = false): AttestationVerdict {
  return { verified: false, code, reason, signatureOk };
}

function sha256Digest(value: unknown): value is { algorithm: string; value: string } {
  return Boolean(value && typeof value === "object" && (value as Json).algorithm === "sha256" && /^[0-9a-f]{64}$/.test(String((value as Json).value ?? "")));
}

function signedPayload(a: Json) {
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
  };
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
    || !/^[0-9a-f]{64}$/.test(String(a.key_id ?? "")) || typeof a.signature !== "string") {
    return fail("malformed", "The attestation is missing a field, so the check cannot count");
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
  if (f.nonceOwner !== null) {
    return fail("replay", "This attestation nonce was already used, so the check cannot count", true);
  }
  if (a.run_id !== f.runId) {
    return fail("tampered", "The attestation names another run, so the check cannot count", true);
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
  const model = String(f.model ?? "").trim();
  if (model === "" || model === "default" || model === "any") {
    return fail("unregistered-model", "The model is not registered, so the check cannot count", true);
  }
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
    if (!allowed.has(name)) {
      return fail("provenance-unknown", `The stream named ${name}, which is outside the pinned model, so provenance is unknown and the check cannot count`, true);
    }
  }
  return { verified: true, code: "ok", reason: "The daemon attestation verified", signatureOk: true };
}

async function soleOrg(c: Tx): Promise<string> {
  return (await c.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
}

/** Loads the enrolled key, the harness for the digest, and any prior nonce, then judges. */
export async function verifyCountedAttestation(c: Tx, input: {
  runId: string;
  provider: string;
  model: string;
  grade?: string | undefined;
  policyDigest?: string | undefined;
  attestation: unknown;
}): Promise<AttestationVerdict> {
  if (input.attestation == null) {
    return fail("missing", "The check has no attestation, so it cannot count");
  }
  const a = input.attestation as Json;
  const keyId = typeof a?.key_id === "string" ? a.key_id : "";
  const org = await soleOrg(c);
  const keyRow = keyId
    ? (await c.query<{ public_key: string }>(
      "select public_key from daemon_signing_keys where key_id = $1 and org_id = $2 and status = 'active'",
      [keyId, org])).rows[0]
    : undefined;
  const publicKey = keyRow ? Buffer.from(keyRow.public_key, "base64") : null;
  const digestValue = sha256Digest(a?.artifact_digest) ? a.artifact_digest.value : "";
  const harnessRow = digestValue
    ? (await c.query<{ runtime: string }>(
      "select runtime from runtime_artifact_versions where artifact_digest = $1 and org_id = $2 limit 1",
      [digestValue, org])).rows[0]
    : undefined;
  const nonce = typeof a?.nonce === "string" ? a.nonce : "";
  const nonceRow = keyId && nonce
    ? (await c.query<{ run_id: string }>(
      "select run_id from attestation_nonces where key_id = $1 and nonce = $2",
      [keyId, nonce])).rows[0]
    : undefined;
  const verdict = judgeAttestation({
    ...input,
    publicKey,
    harness: harnessRow?.runtime ?? null,
    nonceOwner: nonceRow?.run_id ?? null,
  });
  if (verdict.signatureOk && !nonceRow && keyId && nonce) {
    await c.query(
      "insert into attestation_nonces (key_id, nonce, run_id) values ($1, $2, $3) on conflict do nothing",
      [keyId, nonce, input.runId],
    );
  }
  return verdict;
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
    "select status from daemon_signing_keys where key_id = $1", [keyId])).rows[0];
  if (existing?.status === "retired") throw new Refusal(409, "invalid", "That signing key was retired");
  if (!existing) {
    await c.query(
      "insert into daemon_signing_keys (key_id, org_id, public_key, status, enrolled_by) values ($1, $2, $3, 'active', $4)",
      [keyId, orgId, raw.toString("base64"), memberId],
    );
  }
  return { key_id: keyId, status: "active" };
}
