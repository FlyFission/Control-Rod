import type { Db } from "./db/index.js";
import { command } from "./commands/executor.js";

/**
 * Control room > Usage limits. The daemon reports how much of each agent subscription's limit
 * window is used, as the agent CLIs themselves recorded it (Codex's session log, Claude Code's
 * stream output). This module keeps the latest report and returns it. It keeps only the fields
 * the contract names, so nothing the CLI wrote beside them (a prompt, a token) is stored
 * (ADR 0021).
 */

/**
 * Harnesses the control room names. Ids follow Control Rod's adapters where one exists (claude,
 * codex, grok, opencode, agy) and CodexBar's provider ids otherwise; the daemon maps between them.
 */
const PROVIDERS = [
  "claude", "codex", "gemini", "agy", "cursor", "copilot", "opencode", "opencode-go", "grok",
  "amp", "kiro", "factory", "windsurf", "kilo", "warp", "mistral", "zed", "devin",
] as const;
const SOURCES = ["cli-log", "cli-stream", "codexbar", "none"] as const;
const WINDOWS = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet", "daily", "weekly", "monthly", "primary", "secondary", "tertiary"] as const;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const STATUSES = ["allowed", "warning", "rejected"] as const;
/** The closed set of plan names the control room shows; anything else is dropped. */
const PLANS = ["free", "go", "plus", "pro", "max", "team", "business", "enterprise", "edu"] as const;
const MAX_PROVIDERS = 24;
const MAX_WINDOWS = 8;

export interface UsageWindow {
  id: (typeof WINDOWS)[number];
  window_minutes?: number;
  used_percent: number;
  resets_at?: string;
  observed_at?: string;
  status?: (typeof STATUSES)[number];
}

export interface UsageProvider {
  id: (typeof PROVIDERS)[number];
  source: (typeof SOURCES)[number];
  observed_at?: string;
  plan?: string;
  windows: UsageWindow[];
}

export interface UsageEngine {
  id: "codexbar";
  found: boolean;
  version?: string;
}

export interface UsageLimitsView {
  reported: boolean;
  read_at?: string;
  engine?: UsageEngine;
  providers: UsageProvider[];
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | undefined => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : undefined);

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/;

/**
 * An RFC 3339 time with an explicit offset (Z or +-HH:MM), returned in the API's own ISO form;
 * anything else is dropped. Impossible calendar dates (Feb 30) are dropped, not normalized.
 */
function cleanTime(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 40) return undefined;
  const m = RFC3339.exec(v);
  if (!m) return undefined;
  const [y, mo, d, h, mi, sec] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  if (h > 23 || mi > 59 || sec > 59) return undefined;
  if (m[8] !== undefined && (Number(m[8]) > 23 || Number(m[9]) > 59)) return undefined;
  // Calendar check on the components themselves: Date.UTC would remap years 0-99 to 19xx.
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (mo < 1 || mo > 12 || d < 1 || d > (dim as number)) return undefined;
  const t = Date.parse(v);
  if (!Number.isFinite(t)) return undefined;
  const iso = new Date(t).toISOString();
  // A UTC-normalized year outside 0000-9999 would be a six-digit year the read path drops.
  return /^\d{4}-/.test(iso) ? iso : undefined;
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
  const seen = cleanTime(v.observed_at);
  if (seen) out.observed_at = seen;
  const status = oneOf(STATUSES, v.status);
  if (status) out.status = status;
  return out;
}

/**
 * Strict mode (a daemon report): any malformed provider or window makes the whole report invalid.
 * Lenient mode (reading back what is stored): bad entries are skipped.
 */
function cleanProvider(v: unknown, strict = false): UsageProvider | undefined {
  if (!isRecord(v)) return undefined;
  const id = oneOf(PROVIDERS, v.id);
  const source = oneOf(SOURCES, v.source);
  if (!id || !source) return undefined;
  if (strict && (!Array.isArray(v.windows) || v.windows.length > MAX_WINDOWS)) return undefined;
  const windows: UsageWindow[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(v.windows) ? v.windows.slice(0, MAX_WINDOWS) : []) {
    const w = cleanWindow(item);
    if (!w) {
      if (strict) return undefined;
      continue;
    }
    // Windows of a "none" provider are validated, then discarded.
    if (source === "none" || seen.has(w.id)) continue;
    seen.add(w.id);
    windows.push(w);
  }
  const out: UsageProvider = { id, source, windows };
  const observed = cleanTime(v.observed_at);
  if (observed) out.observed_at = observed;
  const plan = oneOf(PLANS, v.plan);
  if (plan) out.plan = plan;
  return out;
}

function cleanProviders(raw: unknown, strict = false): UsageProvider[] | undefined {
  const out: UsageProvider[] = [];
  const seen = new Set<string>();
  if (strict && (!Array.isArray(raw) || raw.length > MAX_PROVIDERS)) return undefined;
  for (const item of Array.isArray(raw) ? raw.slice(0, MAX_PROVIDERS) : []) {
    const p = cleanProvider(item, strict);
    if (!p) {
      if (strict) return undefined;
      continue;
    }
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

function cleanEngine(v: unknown): UsageEngine | undefined {
  if (!isRecord(v) || v.id !== "codexbar" || typeof v.found !== "boolean") return undefined;
  const out: UsageEngine = { id: "codexbar", found: v.found };
  if (typeof v.version === "string" && VERSION.test(v.version)) out.version = v.version;
  return out;
}

/** Keeps the daemon's latest usage-limit report. Fields outside the contract are not stored. */
export async function recordUsageLimits(db: Db, raw: unknown): Promise<void> {
  if (!isRecord(raw)) return;
  // A report without a valid read time and a providers array is malformed: keep the previous one.
  const readAt = cleanTime(raw.read_at);
  if (!readAt || !Array.isArray(raw.providers)) return;
  const engine = cleanEngine(raw.engine);
  const providers = cleanProviders(raw.providers, true);
  if (!providers) return;
  const value = JSON.stringify({ read_at: readAt, ...(engine ? { engine } : {}), providers });
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
  const engine = cleanEngine(stored.engine);
  return { reported: true, ...(readAt ? { read_at: readAt } : {}), ...(engine ? { engine } : {}), providers: cleanProviders(stored.providers) ?? [] };
}

/**
 * Windows that limit the whole subscription. A per-model window (Claude's seven_day_opus or
 * seven_day_sonnet) or an unnamed third one (tertiary) limits only part of it, so it holds nothing.
 */
const WHOLE_WINDOWS: ReadonlySet<string> = new Set(["five_hour", "seven_day", "primary", "secondary", "daily", "weekly", "monthly"]);

/** Plain names for the agents the control room can hold work for. */
const AGENT_NAMES: Readonly<Record<string, string>> = { claude: "Claude", codex: "Codex", agy: "Antigravity", grok: "Grok" };

/**
 * Agents whose last reading says a whole-subscription window is used up (the vendor's own
 * "rejected", or 100 percent), mapped to when the last such window resets. A window without a reset
 * time, or one whose reset has passed, holds nothing: a reading is not renewed while no run uses
 * the agent, so time alone releases the hold.
 */
export async function exhaustedAgents(q: Pick<Db, "query">, at: number = Date.now()): Promise<Map<string, string>> {
  const row = (await q.query<{ value: string }>("select value from settings where key = 'usage_limits'")).rows[0];
  const out = new Map<string, string>();
  if (!row) return out;
  let stored: unknown;
  try {
    stored = JSON.parse(row.value);
  } catch {
    return out;
  }
  if (!isRecord(stored)) return out;
  for (const p of cleanProviders(stored.providers) ?? []) {
    for (const w of p.windows) {
      if (!WHOLE_WINDOWS.has(w.id) || !w.resets_at || Date.parse(w.resets_at) <= at) continue;
      if (w.status !== "rejected" && w.used_percent < 100) continue;
      const seen = out.get(p.id);
      if (!seen || Date.parse(w.resets_at) > Date.parse(seen)) out.set(p.id, w.resets_at);
    }
  }
  return out;
}

/** What a card held for a used-up limit says, in plain words. */
export function usageHoldReason(agent: string, resetsAt: string): string {
  const iso = new Date(resetsAt).toISOString();
  return `${AGENT_NAMES[agent] ?? agent}'s usage limit is used up. This card starts on its own when it resets, at ${iso.slice(11, 16)} UTC on ${iso.slice(0, 10)}.`;
}
