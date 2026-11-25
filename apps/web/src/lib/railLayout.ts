import { readString, writeString } from "./storage.js";

/**
 * The desktop navigation rail's width and whether it is tucked away. A per-viewer convenience kept in
 * this browser, one entry per signed-in person, so two people on a shared machine each keep their own.
 * Widths are stored in pixels, not as a share of the window, so the rail keeps its width when the
 * window is resized.
 */
export const RAIL_DEFAULT_PX = 248;
export const RAIL_MIN_PX = 200;
export const RAIL_MAX_PX = 480;

export interface RailLayout {
  width: number;
  collapsed: boolean;
}

export const railLayoutKey = (user: string | undefined) => `cr.rail:${user ?? ""}`;

export function clampRailWidth(px: number): number {
  if (!Number.isFinite(px)) return RAIL_DEFAULT_PX;
  return Math.round(Math.min(RAIL_MAX_PX, Math.max(RAIL_MIN_PX, px)));
}

export function loadRailLayout(user: string | undefined): RailLayout {
  const fallback = { width: RAIL_DEFAULT_PX, collapsed: false };
  const raw = readString(railLayoutKey(user));
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    const { width, collapsed } = parsed as Partial<RailLayout>;
    return {
      width: typeof width === "number" ? clampRailWidth(width) : RAIL_DEFAULT_PX,
      collapsed: collapsed === true,
    };
  } catch {
    return fallback;
  }
}

export function saveRailLayout(user: string | undefined, layout: RailLayout): void {
  writeString(railLayoutKey(user), JSON.stringify({ width: clampRailWidth(layout.width), collapsed: layout.collapsed }));
}
