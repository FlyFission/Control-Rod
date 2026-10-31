import { randomUUID } from "node:crypto";
import type { Db, Tx } from "./db/index.js";
import type { Actor } from "./events.js";
import { Refusal } from "./refusal.js";
import { getObject, recordObject, transition } from "./workbench.js";

/**
 * Runtime qualification and pins (workbench specification 21; plan task 2.5). The daemon's probe
 * reports each runtime's executable by resolved path and SHA-256; every change is recorded as a
 * RuntimeProbe. An administrator pins an artifact for a runtime and role with a passkey; a pin
 * names a version a passing probe saw, so a failed update keeps the previous pin. A run whose role
 * has a pin launches exactly that artifact (the daemon checks the digest before launch, and the
 * claim never offers a runtime whose installed artifact differs). Rollback restores the previous
 * pin, also signed. Unpinned runtimes still launch by digest: the artifact the last probe saw.
 */

const ROLES = ["intake", "author", "pre-check"] as const;
export const PINNABLE = ["claude", "codex"];

export interface ProbeArtifact { path: string; digest: { algorithm: "sha256"; value: string } }

/* eslint-disable @typescript-eslint/no-explicit-any -- records are validated JSON */
type Json = any;

/** Records a RuntimeProbe whenever a runtime's artifact, version or readiness changes. */
export async function recordProbes(c: Tx, statuses: { runtime: string; ready: boolean; version?: string; reason?: string; login_checked: boolean; artifact?: ProbeArtifact }[]) {
  for (const s of statuses) {
    if (!s.artifact || !PINNABLE.includes(s.runtime)) continue;
    const last = (await c.query<{ body: Json }>(
      "select body from runtime_probes where body->>'runtime' = $1 order by body->>'observed_at' desc limit 1", [s.runtime])).rows[0]?.body;
    const outcome = s.ready ? "pass" : "fail";
    if (last && last.artifact_digest.value === s.artifact.digest.value && last.outcome === outcome && last.version === (s.version ?? "")) continue;
    const org = (await c.query<{ id: string }>("select tenancy_sole_org() as id")).rows[0]!.id;
    await recordObject(c, "runtime_probe", {
      id: `rpb_${randomUUID().replaceAll("-", "").slice(0, 20)}`, org_id: org, runtime: s.runtime, artifact_digest: s.artifact.digest,
      version: s.version ?? "", auth_state: s.login_checked ? (s.ready ? "signed-in" : "signed-out") : "unknown", outcome,
      detail: (s.reason ?? (s.ready ? "ready" : "not ready")).slice(0, 300), observed_at: new Date().toISOString(),
    } as never, { kind: "agent", id: "daemon" });
  }
}

/** The active pin for a runtime and role, if one exists. */
export async function activePin(q: Db | Tx, runtime: string, role: string): Promise<Json | null> {
  const r = await q.query<{ body: Json }>(
    "select body from runtime_pins where body->>'runtime' = $1 and body->>'role' = $2 and body->>'status' = 'active' limit 1", [runtime, role]);
  return r.rows[0]?.body ?? null;
}

function rolesFor(role: unknown): string[] {
  if (role === undefined) return [...ROLES];
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) throw new Refusal(400, "invalid", "role must be intake, author or pre-check");
  return [role];
}

/** Makes one artifact version the active pin for each role, retiring what was active. */
async function setPins(c: Tx, orgId: string, runtime: string, roles: string[], version: Json, actor: Actor, reason: string) {
  const pins: Json[] = [];
  for (const role of roles) {
    const current = await activePin(c, runtime, role);
    if (current?.artifact_digest.value === version.artifact_digest.value) { pins.push(current); continue; }
    if (current) await transition(c, "runtime_pin", current.id, "retired", actor, reason);
    const pin = { id: `pin_${randomUUID().replaceAll("-", "").slice(0, 20)}`, org_id: orgId, role, runtime, artifact_version_id: version.id,
      artifact_digest: version.artifact_digest, status: "active" };
    await recordObject(c, "runtime_pin", pin as never, actor);
    pins.push(pin);
  }
  return pins;
}

/**
 * Pins a probed artifact (admin command runtime.pin). Only a version a passing probe saw can be
 * pinned, so a broken update never replaces a working pin.
 */
export async function pinRuntime(c: Tx, orgId: string, p: Json, actor: Actor) {
  const runtime = String(p.runtime ?? "");
  if (!PINNABLE.includes(runtime)) throw new Refusal(400, "invalid", "runtime must be claude or codex");
  const digest = String(p.artifact_digest ?? "");
  if (!/^[0-9a-f]{64}$/.test(digest)) throw new Refusal(400, "invalid", "artifact_digest must be a SHA-256 in hex");
  const roles = rolesFor(p.role);
  const probes = await c.query<{ body: Json }>(
    "select body from runtime_probes where body->>'runtime' = $1 and body->'artifact_digest'->>'value' = $2 and body->>'outcome' = 'pass' order by body->>'observed_at' desc",
    [runtime, digest]);
  if (!probes.rows.length) throw new Refusal(409, "artifact-not-qualified", "No passing probe has seen this artifact; a daemon must probe it ready before it can be pinned");
  const versionId = `rav_${digest.slice(0, 32)}`;
  let version = await getObject<Json>(c, "runtime_artifact_version", versionId);
  if (!version) {
    version = { id: versionId, org_id: orgId, runtime, version: probes.rows[0]!.body.version, artifact_digest: { algorithm: "sha256", value: digest },
      install_path: String(p.install_path ?? "reported by the daemon's probe").slice(0, 500), probe_ids: probes.rows.slice(0, 20).map((r) => r.body.id) };
    await recordObject(c, "runtime_artifact_version", version as never, actor);
  }
  return setPins(c, orgId, runtime, roles, version, actor, `pinned ${runtime} ${String(version.version)}`);
}

/** Restores, for each role, the artifact pinned before the current one (admin command runtime.rollback). */
export async function rollbackRuntime(c: Tx, orgId: string, p: Json, actor: Actor) {
  const runtime = String(p.runtime ?? "");
  if (!PINNABLE.includes(runtime)) throw new Refusal(400, "invalid", "runtime must be claude or codex");
  const out: Json[] = [];
  for (const role of rolesFor(p.role)) {
    const current = await activePin(c, runtime, role);
    if (!current) throw new Refusal(409, "no-pin", `Nothing is pinned for ${runtime} ${role}`);
    const prev = (await c.query<{ body: Json }>(
      `select body from runtime_pins where body->>'runtime' = $1 and body->>'role' = $2 and body->>'status' = 'retired'
         and body->'artifact_digest'->>'value' <> $3 order by recorded_at desc limit 1`, [runtime, role, current.artifact_digest.value])).rows[0]?.body;
    if (!prev) throw new Refusal(409, "no-previous-pin", `There is no earlier pin for ${runtime} ${role} to roll back to`);
    const version = await getObject<Json>(c, "runtime_artifact_version", prev.artifact_version_id);
    out.push(...await setPins(c, orgId, runtime, [role], version, actor, `rolled back ${runtime} ${role}`));
  }
  return out;
}
