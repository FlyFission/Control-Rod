/** The control room's arrangement: module order and which are collapsed. Kept in this browser only. */
export const LAYOUT_KEY = "controlrod.controlRoom.layout.v1";

export interface Layout {
  order: string[];
  collapsed: string[];
}

/** Stored ids that still exist, once each, then any module the stored layout has not met, in registry order. */
export function resolveLayout(known: string[], stored: unknown): Layout {
  const s = (stored && typeof stored === "object" ? stored : {}) as { order?: unknown; collapsed?: unknown };
  const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const order: string[] = [];
  for (const id of strings(s.order)) if (known.includes(id) && !order.includes(id)) order.push(id);
  for (const id of known) if (!order.includes(id)) order.push(id);
  return { order, collapsed: strings(s.collapsed).filter((id, i, a) => known.includes(id) && a.indexOf(id) === i) };
}

export function loadLayout(known: string[]): Layout {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    return resolveLayout(known, raw ? JSON.parse(raw) : null);
  } catch {
    return resolveLayout(known, null);
  }
}

export function saveLayout(layout: Layout): void {
  try {
    window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* storage blocked or full: the arrangement lasts until reload */
  }
}

/** Moves `id` to `index` (clamped); returns the same array when nothing changes. */
export function moveTo(order: string[], id: string, index: number): string[] {
  const from = order.indexOf(id);
  const to = Math.min(order.length - 1, Math.max(0, index));
  if (from < 0 || from === to) return order;
  const next = order.slice();
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
