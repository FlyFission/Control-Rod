import { DEFAULT_LENS, type Lens } from "../../lib/lenses.js";

export type SavedView = {
  name: string;
  lens: Lens;
};

const VALID_KINDS = new Set(["all", "code", "doc"]);
const VALID_COLORS = new Set(["kind", "state", "agent", "person", "none"]);
const VALID_GROUPS = new Set(["none", "kind", "person", "project"]);
const VALID_DENSITIES = new Set(["comfortable", "compact"]);

/** Storage key for a member's saved views. */
export function viewsStorageKey(user?: string): string {
  return `cr.views.${user ?? ""}`;
}

function sanitizeLens(raw: unknown): Lens {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LENS };
  const r = raw as Record<string, unknown>;
  return {
    kind: typeof r["kind"] === "string" && VALID_KINDS.has(r["kind"]) ? (r["kind"] as Lens["kind"]) : DEFAULT_LENS.kind,
    needs: typeof r["needs"] === "boolean" ? r["needs"] : DEFAULT_LENS.needs,
    mine: typeof r["mine"] === "boolean" ? r["mine"] : DEFAULT_LENS.mine,
    colorBy: typeof r["colorBy"] === "string" && VALID_COLORS.has(r["colorBy"]) ? (r["colorBy"] as Lens["colorBy"]) : DEFAULT_LENS.colorBy,
    groupBy: typeof r["groupBy"] === "string" && VALID_GROUPS.has(r["groupBy"]) ? (r["groupBy"] as Lens["groupBy"]) : DEFAULT_LENS.groupBy,
    density: typeof r["density"] === "string" && VALID_DENSITIES.has(r["density"]) ? (r["density"] as Lens["density"]) : DEFAULT_LENS.density,
  };
}

/**
 * Loads saved views from browser localStorage for `user`. Returns `[]` on missing or unreadable storage.
 */
export function loadViews(user?: string): SavedView[] {
  try {
    const raw = window.localStorage.getItem(viewsStorageKey(user));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: SavedView[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const name = (item as Record<string, unknown>)["name"];
      if (typeof name !== "string" || name.trim().length === 0) continue;
      out.push({ name: name.trim(), lens: sanitizeLens((item as Record<string, unknown>)["lens"]) });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Saves or replaces a named view in browser localStorage for `user`. Storage errors are ignored.
 */
export function saveView(v: SavedView, user?: string): void {
  const name = v.name.trim();
  if (!name) return;
  try {
    const existing = loadViews(user).filter((item) => item.name !== name);
    existing.push({ name, lens: sanitizeLens(v.lens) });
    window.localStorage.setItem(viewsStorageKey(user), JSON.stringify(existing));
  } catch {
    // Ignored: private windows and blocked storage.
  }
}

/**
 * Deletes a saved view by name from browser localStorage for `user`. Storage errors are ignored.
 */
export function deleteView(name: string, user?: string): void {
  try {
    const remaining = loadViews(user).filter((item) => item.name !== name);
    window.localStorage.setItem(viewsStorageKey(user), JSON.stringify(remaining));
  } catch {
    // Ignored: private windows and blocked storage.
  }
}
