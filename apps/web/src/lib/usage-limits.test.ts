import { describe, expect, it } from "vitest";
import type { UsageProvider, UsageWindow } from "../api/types.js";
import { ownAge, readWindow, runsOutBefore, windowLabel, windowObservedAt } from "./usage-limits.js";

const NOW = Date.parse("2026-11-24T12:00:00.000Z");
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(NOW + ms).toISOString();

describe("usage pace", () => {
  // A 10-hour window resetting in 4h: 6h elapsed now. At the reading (2h ago) 4h had elapsed.
  const w: UsageWindow = { id: "five_hour", window_minutes: 600, used_percent: 50, resets_at: iso(4 * HOUR) };

  it("judges pace at the reading's time while the countdown uses now", () => {
    const atNow = readWindow(w, NOW);
    const seen = readWindow(w, NOW, iso(-2 * HOUR));
    expect(atNow.timeLeft).toBeCloseTo(0.4);
    expect(seen.timeLeft).toBeCloseTo(0.6);
    expect(seen.resetsInMs).toBe(4 * HOUR);
    // 50% used in 4h would last 4 more hours: out 2h after the reading, 2h before reset... judged at the reading.
    expect(runsOutBefore(w, seen)).toBe(2 * HOUR);
    // Judged at now (6h elapsed) the same numbers would look better: 6h left of reserve against 4h left.
    expect(runsOutBefore(w, atNow)).toBeNull();
  });

  it("never looks past now, and falls back to now when no time is given", () => {
    expect(readWindow(w, NOW, iso(3 * HOUR)).timeLeft).toBeCloseTo(0.4);
    expect(readWindow(w, NOW, "garbage").timeLeft).toBeCloseTo(0.4);
  });
});

describe("window labels", () => {
  it("come from the window id only", () => {
    expect(windowLabel({ id: "seven_day_opus", used_percent: 1, label: "x" } as UsageWindow)).toBe("7-day, Opus");
    expect(windowLabel({ id: "tertiary", used_percent: 1 })).toBe("Third window");
    expect(windowLabel({ id: "primary", used_percent: 1 })).toBe("Primary window");
  });
});

describe("window freshness", () => {
  const p: UsageProvider = { id: "codex", source: "cli-log", observed_at: iso(-HOUR), windows: [] };
  const win = (observed_at?: string): UsageWindow => ({ id: "weekly", used_percent: 1, ...(observed_at ? { observed_at } : {}) });

  it("takes the window's time, then the provider's, then the report's", () => {
    expect(windowObservedAt(win(iso(-5)), p, iso(-9))).toBe(iso(-5));
    expect(windowObservedAt(win(), p, iso(-9))).toBe(iso(-HOUR));
    const { observed_at: _drop, ...bare } = p;
    expect(windowObservedAt(win(), bare, iso(-9))).toBe(iso(-9));
  });

  it("paces a window at its own reading time", () => {
    const w: UsageWindow = { id: "five_hour", window_minutes: 600, used_percent: 50, resets_at: iso(4 * HOUR), observed_at: iso(-2 * HOUR) };
    expect(readWindow(w, NOW, windowObservedAt(w, p)).timeLeft).toBeCloseTo(0.6);
    const { observed_at: _w, ...plain } = w;
    expect(readWindow(plain, NOW, windowObservedAt(plain, p)).timeLeft).toBeCloseTo(0.5);
  });

  it("states its own age only past a 10 minute gap", () => {
    expect(ownAge(win(iso(-HOUR - 9 * 60_000)), p, undefined, NOW)).toBeNull();
    expect(ownAge(win(iso(-HOUR - 11 * 60_000)), p, undefined, NOW)).toBe("as of 1 h ago");
    expect(ownAge(win(), p, undefined, NOW)).toBeNull();
  });
});
