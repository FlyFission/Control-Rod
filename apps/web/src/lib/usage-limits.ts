import type { UsageProvider, UsageWindow } from "../api/types.js";

/** Plain words for the control room's usage module. Pure functions: the clock is always passed in. */

export const PROVIDER_NAMES: Record<UsageProvider["id"], string> = {
  claude: "Claude Code",
  codex: "Codex",
  gemini: "Gemini CLI",
  agy: "Antigravity",
  cursor: "Cursor",
  copilot: "GitHub Copilot",
  opencode: "opencode",
  "opencode-go": "opencode Go",
  grok: "Grok CLI",
  amp: "Amp",
  kiro: "Kiro",
  factory: "Factory Droid",
  windsurf: "Windsurf",
  kilo: "Kilo Code",
  warp: "Warp",
  mistral: "Mistral Vibe",
  zed: "Zed",
  devin: "Devin",
};

/** The display name of any provider id; an id this table does not know is shown as sent. */
export const providerName = (id: string): string => (PROVIDER_NAMES as Record<string, string>)[id] ?? id;

export const WINDOW_LABELS: Record<UsageWindow["id"], string> = {
  five_hour: "5-hour window",
  seven_day: "7-day window",
  seven_day_opus: "7-day, Opus",
  seven_day_sonnet: "7-day, Sonnet",
  monthly: "Monthly",
  primary: "Primary window",
  secondary: "Secondary window",
  tertiary: "Third window",
  daily: "Daily",
  weekly: "Weekly",
};

/** The row label: our words for the window id. The API carries no free-text label. */
export const windowLabel = (w: UsageWindow): string => WINDOW_LABELS[w.id];

export const LOW_AT = 20;
export const CRITICAL_AT = 5;

export type Tone = "ok" | "needs" | "stuck";

export interface Reading {
  left: number;
  tone: Tone;
  /** The window has reset since the CLI recorded this reading. */
  stale: boolean;
  /** Milliseconds until reset; null when unknown. Never negative. */
  resetsInMs: number | null;
  /** Share of the window still to come (0..1) at the moment of the reading; null when the window length or reset time is unknown. */
  timeLeft: number | null;
  /** Milliseconds from the reading to the reset, for pace; null when unknown. Never negative. */
  paceLeftMs: number | null;
  state: "allowed" | "low" | "critical" | "rejected" | "stale";
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * `observedAt` is when the CLI recorded the reading (its observed_at, else the report's read_at).
 * Pace is judged at that moment, since used_percent is as of then; the countdown to reset uses `now`.
 */
export function readWindow(w: UsageWindow, now: number, observedAt?: string | null): Reading {
  const left = clamp(Math.round(100 - w.used_percent), 0, 100);
  const resetMs = w.resets_at ? Date.parse(w.resets_at) : NaN;
  const known = Number.isFinite(resetMs);
  const stale = known && resetMs <= now;
  const resetsInMs = known ? Math.max(0, resetMs - now) : null;
  const seen = observedAt ? Date.parse(observedAt) : NaN;
  const paceAt = Number.isFinite(seen) ? Math.min(seen, now) : now;
  const paceLeftMs = known ? Math.max(0, resetMs - paceAt) : null;
  const timeLeft = known && w.window_minutes ? clamp((resetMs - paceAt) / (w.window_minutes * 60_000), 0, 1) : null;
  let state: Reading["state"] = "allowed";
  if (stale) state = "stale";
  else if (w.status === "rejected") state = "rejected";
  else if (left <= CRITICAL_AT) state = "critical";
  else if (left <= LOW_AT || w.status === "warning") state = "low";
  const tone: Tone = state === "rejected" || state === "critical" ? "stuck" : state === "low" ? "needs" : "ok";
  return { left, tone, stale, resetsInMs, timeLeft, paceLeftMs, state };
}

/** <1h -> "43m", <24h -> "2h 11m", else "4d 3h". */
export function shortDuration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "<1m";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** The same duration for a screen reader: "2 hours 11 minutes". */
export function spokenDuration(ms: number): string {
  const min = Math.floor(ms / 60_000);
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (min < 1) return "less than a minute";
  if (min < 60) return unit(min, "minute");
  const h = Math.floor(min / 60);
  if (h < 24) return `${unit(h, "hour")} ${unit(min % 60, "minute")}`;
  return `${unit(Math.floor(h / 24), "day")} ${unit(h % 24, "hour")}`;
}

/** "just now", "14 min ago", "3 h ago", "2 d ago". */
export function ago(iso: string, now: number): string | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const min = Math.floor(Math.max(0, now - t) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

export function sourceWords(p: UsageProvider): string {
  const name = providerName(p.id);
  return p.source === "codexbar" ? "CodexBar" : p.source === "cli-log" ? `${name}'s session log` : p.source === "cli-stream" ? `${name}'s run output` : name;
}

/**
 * Linear extrapolation: if used so far over the time elapsed continues, when does the reserve run out,
 * and how long before the reset is that? Null when the window is not far enough along (under 5%),
 * nothing is used yet, or the reserve outlasts the window.
 */
export function runsOutBefore(w: UsageWindow, r: Reading): number | null {
  if (r.stale || r.timeLeft === null || r.paceLeftMs === null || !w.window_minutes) return null;
  const windowMs = w.window_minutes * 60_000;
  const elapsed = windowMs - r.paceLeftMs;
  if (elapsed < windowMs * 0.05 || w.used_percent <= 0 || r.left <= 0) return null;
  const outAfter = (r.left / w.used_percent) * elapsed;
  const early = r.paceLeftMs - outAfter;
  return early >= 60_000 ? early : null;
}

export interface Lowest {
  provider: UsageProvider;
  window: UsageWindow;
  reading: Reading;
}

/** The window with the least reserve among live readings; a refused window counts as zero. */
export function lowestReserve(providers: UsageProvider[], now: number): Lowest | null {
  let best: Lowest | null = null;
  for (const provider of providers) {
    for (const window of provider.windows) {
      const reading = readWindow(window, now);
      if (reading.stale) continue;
      const eff = reading.state === "rejected" ? 0 : reading.left;
      const cur = best ? (best.reading.state === "rejected" ? 0 : best.reading.left) : Infinity;
      if (eff < cur) best = { provider, window, reading };
    }
  }
  return best;
}

/** The reserve a provider is judged by: its lowest live window; a refused window counts as zero; null when nothing is live. */
export function providerReserve(p: UsageProvider, now: number): { left: number | null; tone: Tone } {
  let left: number | null = null;
  let tone: Tone = "ok";
  for (const w of p.windows) {
    const r = readWindow(w, now);
    if (r.stale) continue;
    const eff = r.state === "rejected" ? 0 : r.left;
    if (left === null || eff < left) left = eff;
    if (r.tone === "stuck" || (r.tone === "needs" && tone === "ok")) tone = r.tone;
  }
  return { left, tone };
}

/** Amber or red providers first, then least reserve, then by name. Providers with no live reading sort last. */
export function orderProviders(providers: UsageProvider[], now: number): UsageProvider[] {
  const keyed = providers.map((p) => ({ p, ...providerReserve(p, now), name: providerName(p.id) }));
  keyed.sort((a, b) => {
    const wa = a.tone === "ok" ? 1 : 0;
    const wb = b.tone === "ok" ? 1 : 0;
    if (wa !== wb) return wa - wb;
    const la = a.left ?? Infinity;
    const lb = b.left ?? Infinity;
    if (la !== lb) return la - lb;
    return a.name.localeCompare(b.name);
  });
  return keyed.map((k) => k.p);
}
