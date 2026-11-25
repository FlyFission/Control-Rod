import type { Db } from "./db/index.js";
import { command } from "./commands/executor.js";

/**
 * Settings > Subscriptions. The daemon reports probes of registered provider CLIs.
 * This module stores that report and returns it. It does not invent a CLI, and it
 * drops any field that could carry a token (ADR 0021).
 *
 * Checker tiers are the milestone record: Safety needs 2 checkers from different
 * vendor families; every other grade needs 1. A local model cannot decide Safety
 * or Material. Those sentences are policy, not a measured probe.
 */

const now = () => new Date().toISOString();

/** Provider CLIs the daemon registers today. Anything else is not stored. */
const PROVIDERS = ["claude", "codex", "agy", "grok"] as const;

const AUTH = ["signed-in", "signed-out", "unknown"] as const;

const AUTH_NOTES = [
  "The CLI's status command succeeded.",
  "The CLI's status command did not succeed.",
  "This CLI has no auth-status command.",
  "The status command could not be run.",
  "Auth was not checked because the CLI is not installed.",
] as const;

/** Milestone M10. Safety is 2-of-2 from different vendor families; other grades are 1. */
export const CHECKER_TIERS = [
  { grade: "safety" as const, required: 2, rule: "Safety needs 2 checkers from different vendor families." },
  { grade: "material" as const, required: 1, rule: "Material needs 1 checker." },
  { grade: "general-service" as const, required: 1, rule: "General service needs 1 checker." },
];

export const LOCAL_CHECKER_RULE = "A local model cannot be the deciding checker on Safety or Material.";

const SECRET_KEY = /^(token|.*api[-_]?key|secret|password|authorization|refresh_token|access_token|credential)$/i;
const TAINTED = /sk-|api[_-]?key|bearer\s|ghp_|xox|token/i;

export interface SubscriptionRole {
  role: "author" | "checker";
  qualified: boolean;
  reason: string;
}

export interface SubscriptionProbe {
  id: string;
  display_name: string;
  vendor_family?: string;
  installed: boolean;
  path?: string;
  observed_version?: string;
  auth: (typeof AUTH)[number];
  auth_note?: string;
  roles: SubscriptionRole[];
}

export interface SubscriptionChecker {
  id: string;
  harness: string;
  vendor_family?: string;
  deciding: boolean;
  local: boolean;
  hosts: string[];
}

export interface SubscriptionPin {
  runtime: string;
  role: "author" | "checker";
  version?: string;
  digest: { algorithm: "sha256"; value: string };
}

export interface SubscriptionView {
  reported: boolean;
  reported_at?: string;
  platform?: string;
  probes: SubscriptionProbe[];
  checkers: SubscriptionChecker[];
  tiers: typeof CHECKER_TIERS;
  local_rule: string;
  pins: SubscriptionPin[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function hasSecretKey(v: unknown): boolean {
  if (!isRecord(v) && !Array.isArray(v)) return false;
  if (Array.isArray(v)) return v.some(hasSecretKey);
  return Object.entries(v).some(([k, child]) => SECRET_KEY.test(k) || hasSecretKey(child));
}

function text(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const line = v.split("\n")[0]?.trim() ?? "";
  if (!line || line.length > max || TAINTED.test(line)) return undefined;
  return line;
}

function cleanRole(v: unknown): SubscriptionRole | undefined {
  if (!isRecord(v) || hasSecretKey(v)) return undefined;
  if (v.role !== "author" && v.role !== "checker") return undefined;
  const reason = text(v.reason, 300);
  if (!reason) return undefined;
  return { role: v.role, qualified: v.qualified === true, reason };
}

function cleanProbe(v: unknown): SubscriptionProbe | undefined {
  if (!isRecord(v) || hasSecretKey(v)) return undefined;
  const id = v.id;
  if (typeof id !== "string" || !(PROVIDERS as readonly string[]).includes(id)) return undefined;
  const display = text(v.display_name, 80);
  if (!display) return undefined;
  const family = text(v.vendor_family, 40);
  const path = text(v.path, 4096);
  const version = text(v.observed_version, 200);
  const roles = Array.isArray(v.roles) ? v.roles.map(cleanRole).filter((r): r is SubscriptionRole => r !== undefined) : [];
  const auth = AUTH.includes(v.auth as (typeof AUTH)[number]) ? (v.auth as (typeof AUTH)[number]) : "unknown";
  const note = typeof v.auth_note === "string" && (AUTH_NOTES as readonly string[]).includes(v.auth_note) ? v.auth_note : undefined;
  return {
    id,
    display_name: display,
    ...(family ? { vendor_family: family } : {}),
    installed: v.installed === true,
    ...(path ? { path } : {}),
    ...(version ? { observed_version: version } : {}),
    auth,
    ...(note ? { auth_note: note } : {}),
    roles,
  };
}

function cleanChecker(v: unknown): SubscriptionChecker | undefined {
  if (!isRecord(v) || hasSecretKey(v)) return undefined;
  const id = text(v.id, 80);
  const harness = text(v.harness, 40);
  if (!id || !harness || !/^[a-z0-9][a-z0-9._-]*$/.test(id) || !/^[a-z0-9][a-z0-9-]*$/.test(harness)) return undefined;
  const family = text(v.vendor_family, 40);
  const hosts = Array.isArray(v.hosts)
    ? v.hosts.filter((h): h is string => typeof h === "string" && /^[a-z0-9.-]{1,253}$/.test(h) && !TAINTED.test(h)).slice(0, 8)
    : [];
  return {
    id,
    harness,
    ...(family ? { vendor_family: family } : {}),
    deciding: v.deciding === true,
    local: v.local === true,
    hosts,
  };
}

function cleanPlatform(v: unknown): string | undefined {
  if (typeof v !== "string" || !/^[a-z0-9]{1,32}$/.test(v)) return undefined;
  return v;
}

/** Keeps the daemon's latest subscription probe. A probe that carries a token is dropped. */
export async function recordSubscriptionReport(db: Db, raw: unknown): Promise<void> {
  if (!isRecord(raw)) return;
  const probes: SubscriptionProbe[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw.probes) ? raw.probes.slice(0, PROVIDERS.length) : []) {
    const probe = cleanProbe(item);
    if (!probe || seen.has(probe.id)) continue;
    seen.add(probe.id);
    probes.push(probe);
  }
  const checkers: SubscriptionChecker[] = [];
  for (const item of Array.isArray(raw.checkers) ? raw.checkers.slice(0, 20) : []) {
    const checker = cleanChecker(item);
    if (checker) checkers.push(checker);
  }
  const platform = cleanPlatform(raw.platform);
  const stored = {
    reported_at: now(),
    ...(platform ? { platform } : {}),
    probes,
    checkers,
  };
  const value = JSON.stringify(stored);
  await command(db, "runtime.report-status", async (c) => {
    await c.query("insert into settings (key, value) values ('subscription_report', $1) on conflict (key) do update set value = excluded.value", [value]);
  });
}

function digestOf(v: unknown): { algorithm: "sha256"; value: string } | undefined {
  if (!isRecord(v)) return undefined;
  const digest = v.digest;
  if (!isRecord(digest) || digest.algorithm !== "sha256" || typeof digest.value !== "string" || !/^[0-9a-f]{64}$/.test(digest.value)) return undefined;
  return { algorithm: "sha256", value: digest.value };
}

/** Active author and pre-check pins, with the version string the artifact record holds. */
export async function subscriptionPins(db: Db, orgId: string): Promise<SubscriptionPin[]> {
  const pins = (await db.query<{ body: Record<string, unknown> }>(
    "select body from runtime_pins where body->>'status' = 'active' and body->>'org_id' = $1",
    [orgId],
  )).rows.map((r) => r.body);
  const versions = new Map<string, string>();
  const rows = await db.query<{ body: Record<string, unknown> }>(
    "select body from runtime_artifact_versions where body->>'org_id' = $1",
    [orgId],
  );
  for (const row of rows.rows) {
    const id = row.body.id;
    const version = row.body.version;
    if (typeof id === "string" && typeof version === "string" && version && !TAINTED.test(version)) versions.set(id, version.slice(0, 200));
  }
  const out: SubscriptionPin[] = [];
  for (const pin of pins) {
    if (typeof pin.runtime !== "string" || !(PROVIDERS as readonly string[]).includes(pin.runtime)) continue;
    const role = pin.role === "author" ? "author" : pin.role === "pre-check" ? "checker" : undefined;
    const digest = digestOf({ digest: pin.artifact_digest });
    if (!role || !digest) continue;
    const version = typeof pin.artifact_version_id === "string" ? versions.get(pin.artifact_version_id) : undefined;
    out.push({ runtime: pin.runtime, role, ...(version ? { version } : {}), digest });
  }
  out.sort((a, b) => a.runtime.localeCompare(b.runtime) || a.role.localeCompare(b.role));
  return out;
}

export async function subscriptionView(db: Db, orgId: string): Promise<SubscriptionView> {
  const pins = await subscriptionPins(db, orgId);
  const row = (await db.query<{ value: string }>("select value from settings where key = 'subscription_report'")).rows[0];
  const base = { tiers: CHECKER_TIERS, local_rule: LOCAL_CHECKER_RULE, pins };
  if (!row) return { reported: false, probes: [], checkers: [], ...base };
  let stored: unknown;
  try {
    stored = JSON.parse(row.value);
  } catch {
    return { reported: false, probes: [], checkers: [], ...base };
  }
  if (!isRecord(stored)) return { reported: false, probes: [], checkers: [], ...base };
  const probes = Array.isArray(stored.probes) ? stored.probes.map(cleanProbe).filter((p): p is SubscriptionProbe => p !== undefined) : [];
  const checkers = Array.isArray(stored.checkers) ? stored.checkers.map(cleanChecker).filter((c): c is SubscriptionChecker => c !== undefined) : [];
  const reportedAt = typeof stored.reported_at === "string" ? stored.reported_at : undefined;
  const platform = cleanPlatform(stored.platform);
  return {
    reported: true,
    ...(reportedAt ? { reported_at: reportedAt } : {}),
    ...(platform ? { platform } : {}),
    probes,
    checkers,
    ...base,
  };
}
