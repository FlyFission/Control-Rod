import type { FloorPreferencesV1 } from "./types.js";
export const PREFERENCES_KEY = "cr.floor.preferences.v1";
export const DEFAULT_PREFERENCES: FloorPreferencesV1 = {
  schemaVersion: 1,
  themeId: "plain",
  motion: "full",
  view: "scene",
};
export function isFloorPreferenceRecord(
  value: unknown,
): value is FloorPreferencesV1 {
  if (!value || typeof value !== "object") return false;
  const p = value as FloorPreferencesV1;
  return (
    p.schemaVersion === 1 &&
    typeof p.themeId === "string" &&
    /^[a-z-]{1,80}$/.test(p.themeId) &&
    ["full", "quiet", "still"].includes(p.motion) &&
    ["scene", "list"].includes(p.view)
  );
}
export function parseFloorPreferences(
  raw: string | null,
  fallback: FloorPreferencesV1 = DEFAULT_PREFERENCES,
): FloorPreferencesV1 {
  try {
    const p = JSON.parse(raw ?? "null") as FloorPreferencesV1;
    if (isFloorPreferenceRecord(p))
      return {
        schemaVersion: 1,
        themeId: p.themeId,
        motion: p.motion,
        view: p.view,
      };
  } catch {
    /* fall back */
  }
  return { ...fallback };
}
export function readFloorPreferences(): FloorPreferencesV1 {
  try {
    return parseFloorPreferences(localStorage.getItem(PREFERENCES_KEY));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}
export function writeFloorPreferences(p: FloorPreferencesV1): void {
  try {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({
        schemaVersion: 1,
        themeId: p.themeId,
        motion: p.motion,
        view: p.view,
      }),
    );
  } catch {
    /* memory preferences still work */
  }
}
