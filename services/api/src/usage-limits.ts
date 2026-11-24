import type { Db } from "./db/index.js";
import { command } from "./commands/executor.js";

/**
 * Control room > Usage limits. The daemon reports how much of each agent subscription's limit
 * window is used, as the agent CLIs themselves recorded it (Codex's session log, Claude Code's
 * stream output). This module keeps the latest report and returns it. It keeps only the fields
 * the contract names, so nothing the CLI wrote beside them (a prompt, a token) is stored
 * (ADR 0021).
 */

const PROVIDERS = ["claude", "codex", "grok", "opencode", "agy"] as const;
const SOURCES = ["cli-log", "cli-stream", "none"] as const;
const WINDOWS = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "monthly", "primary", "secondary"] as const;
const STATUSES = ["allowed", "warning", "rejected"] as const;
const PLAN = /^[a-z0-9_-]{1,24}$/;
/** A plan name is a short word such as "plus" or "max". One that looks like a credential is dropped. */
const TAINTED = /sk-|api[_-]?key|bearer|ghp_|xox|token|secret/i;
const MAX_PROVIDERS = 8;
const MAX_WINDOWS = 8;

export interface UsageWindow {
  id: (typeof WINDOWS)[number];
  window_minutes?: number;
  used_percent: number;
  resets_at?: string;
  status?: (typeof STATUSES)[number];
}

export interface UsageProvider {
  id: (typeof PROVIDERS)[number];
  source: (typeof SOURCES)[number];
  observed_at?: string;
  plan?: string;
  windows: UsageWindow[];
}

export interface UsageLimitsView {
  reported: boolean;
  read_at?: string;
  providers: UsageProvider[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);

/** An RFC 3339 time, returned in the API's own ISO form; anything else is dropped. */
function cleanTime(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 40 || !/^\d{4}-\d{2}-\d{2}T/.test(v)) return undefined;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
}

function cleanWindow(v: unknown): UsageWindow | undefined {
  if (!isRecord(v)) return undefined;
  const id = oneOf(WINDOWS, v.id);
  const used = v.used_percent;
  if (!id || typeof used !== "number" || !Number.isFinite(used) || used < 0 || used > 100) return undefined;
  const out: UsageWindow = { id, used_percent: used };
  const minutes = v.window_minutes;
  if (Number.isInteger(minutes) && (minutes as number) >= 1 && (minutes as number) <= 60000) out.window_minutes = minutes as number;
  const resets = cleanTime(v.resets_at);
  if (resets) out.resets_at = resets;
  const status = oneOf(STATUSES, v.status);
  if (status) out.status = status;
  return out;
}

function cleanProvider(v: unknown): UsageProvider | undefined {
  if (!isRecord(v)) return undefined;
  const id = oneOf(PROVIDERS, v.id);
  const source = oneOf(SOURCES, v.source);
  if (!id || !source) return undefined;
  const windows: UsageWindow[] = [];
  const seen = new Set<string>();
  if (source !== "none") {
    for (const item of Array.isArray(v.windows) ? v.windows.slice(0, MAX_WINDOWS) : []) {
      const w = cleanWindow(item);
      if (!w || seen.has(w.id)) continue;
      seen.add(w.id);
      windows.push(w);
    }
  }
  const out: UsageProvider = { id, source, windows };
  const observed = cleanTime(v.observed_at);
  if (observed) out.observed_at = observed;
  if (typeof v.plan === "string" && PLAN.test(v.plan) && !TAINTED.test(v.plan)) out.plan = v.plan;
  return out;
}

function cleanProviders(raw: unknown): UsageProvider[] {
  const out: UsageProvider[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_PROVIDERS) : []) {
    const p = cleanProvider(item);
    if (!p || seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/** Keeps the daemon's latest usage-limit report. Fields outside the contract are not stored. */
export async function recordUsageLimits(db: Db, raw: unknown): Promise<void> {
  if (!isRecord(raw)) return;
  const readAt = cleanTime(raw.read_at) ?? new Date().toISOString();
  const value = JSON.stringify({ read_at: readAt, providers: cleanProviders(raw.providers) });
  await command(db, "runtime.report-status", async (c) => {
    await c.query("insert into settings (key, value) values ('usage_limits', $1) on conflict (key) do update set value = excluded.value", [value]);
  });
}

export async function usageLimitsView(db: Db): Promise<UsageLimitsView> {
  const row = (await db.query<{ value: string }>("select value from settings where key = 'usage_limits'")).rows[0];
  if (!row) return { reported: false, providers: [] };
  let stored: unknown;
  try {
    stored = JSON.parse(row.value);
  } catch {
    return { reported: false, providers: [] };
  }
  if (!isRecord(stored)) return { reported: false, providers: [] };
  const readAt = cleanTime(stored.read_at);
  return { reported: true, ...(readAt ? { read_at: readAt } : {}), providers: cleanProviders(stored.providers) };
}
