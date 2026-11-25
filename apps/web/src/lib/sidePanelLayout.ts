import { readString, writeString } from "./storage.js";

/**
 * The side panel's width on wide screens: a per-viewer convenience kept in this browser, one entry per
 * signed-in person, in pixels so the panel keeps its width when the window is resized.
 */
export const SIDE_DEFAULT_PX = 520;
export const SIDE_MIN_PX = 380;
export const SIDE_MAX_PX = 960;

export const sidePanelKey = (user: string | undefined) => `cr.side:${user ?? ""}`;

export function clampSideWidth(px: number): number {
  if (!Number.isFinite(px)) return SIDE_DEFAULT_PX;
  return Math.round(Math.min(SIDE_MAX_PX, Math.max(SIDE_MIN_PX, px)));
}

export function loadSideWidth(user: string | undefined): number {
  const raw = readString(sidePanelKey(user));
  if (!raw) return SIDE_DEFAULT_PX;
  const n = Number(raw);
  return Number.isFinite(n) ? clampSideWidth(n) : SIDE_DEFAULT_PX;
}

export function saveSideWidth(user: string | undefined, px: number): void {
  writeString(sidePanelKey(user), String(clampSideWidth(px)));
}
